// "Ativar pacientes": o Claude lê a conversa e (1) sugere caminhos para o
// atendimento ou (2) escreve a próxima mensagem de WhatsApp.
//
// POST { acao: "caminhos" | "escrever", conversationId, roteiros, tipo?, extra?, assina? }
// Só lê a conversa com o login de quem chamou (RLS): ninguém vê conversa de
// número que não pode ver. Nada é enviado daqui; o envio continua no
// crm-send-message, depois que a pessoa confirma.
import Anthropic from "npm:@anthropic-ai/sdk@1.13.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.13.0/helpers/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODELO = "claude-opus-5-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const TIPOS: Record<string, string> = { ativacao: "ATIVAÇÃO", confirmacao: "CONFIRMAÇÃO", negociacao: "NEGOCIAÇÃO" };

const ROTEIRO_PADRAO: Record<string, string> = {
  negociacao: `Objetivo: fechar sem baixar o valor de cara.
1. Gancho: acolha e retome o que o paciente quer, com as palavras dele.
2. Descoberta: se ainda não sabemos o que trava, faça UMA pergunta para descobrir o que pesa (valor total, parcela, entrada ou data).
3. Pitch curto: uma frase sobre o valor do tratamento para ele, sem jargão.
4. Fechamento condicional: quando já sabemos a condição, "Se eu conseguir essa condição para você, fechamos?".
5. CTA: termine com uma ação clara e fácil.
Nunca ofereça desconto ou condição que não esteja na instrução da clínica: diga que vai verificar.`,
  ativacao: `Objetivo: reabrir a conversa e levar a um próximo passo.
1. Gancho: retome o interesse ou a dor que o paciente mostrou, de forma pessoal.
2. Pergunta aberta curta que ele responda fácil.
3. Mini pitch: um benefício concreto de resolver agora.
4. CTA: um passo concreto, de preferência com duas opções.`,
  confirmacao: `Objetivo: tirar a dúvida e confirmar o próximo passo.
1. Retome em uma frase o que foi combinado.
2. Confirme ou proponha data, horário ou envio.
3. CTA de resposta simples.`,
};

const CaminhosSchema = z.object({
  resumo: z.string(),
  etapa: z.string(),
  caminhos: z.array(
    z.object({
      titulo: z.string(),
      quando: z.string(),
      perguntas: z.array(z.string()),
      fechamento: z.string(),
      risco: z.string(),
      tipo: z.enum(["ativacao", "confirmacao", "negociacao"]),
      instrucao: z.string(),
    }),
  ),
});

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const SISTEMA = `Você ajuda a recepção do Instituto Vert, clínica de odontologia estética em Franca-SP e Ribeirão Preto-SP (marca elegante e acolhedora; a dentista responsável é a Dra. Anita). A recepção conversa com pacientes pelo WhatsApp.
Formas de pagamento usuais: à vista no Pix, débito ou dinheiro, ou cartão em até 18-21x com acréscimo da operadora; entrada para reservar a data.
Use só fatos da conversa e do contexto dado. Nunca invente desconto, data, horário, preço ou resultado clínico. Escreva em português do Brasil.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "A chave do Claude (ANTHROPIC_API_KEY) não está configurada." }, 503);

  const body = await req.json().catch(() => ({}));
  const acao = body.acao as string;
  const conversationId = body.conversationId as string;
  if (!conversationId || !["caminhos", "escrever"].includes(acao)) return json({ error: "pedido inválido" }, 400);
  const roteiros: Record<string, string> = { ...ROTEIRO_PADRAO };
  for (const k of Object.keys(ROTEIRO_PADRAO)) {
    const v = body.roteiros?.[k];
    if (typeof v === "string" && v.trim()) roteiros[k] = v.slice(0, 4000);
  }

  // leitura com o login de quem chamou: o RLS decide o que pode ver
  const db = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: conv } = await db
    .from("conversations")
    .select("id, connection_id, contact:crm_contacts(id, name, phone, instagram_username)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ error: "conversa não encontrada" }, 404);
  const contato: any = (conv as any).contact ?? {};

  const [{ data: msgs }, { data: lead }] = await Promise.all([
    db.from("messages").select("direction, type, content, message_at").eq("conversation_id", conversationId)
      .order("message_at", { ascending: false }).limit(40),
    db.from("crm_leads").select("status, source, intent, estimated_value").eq("contact_id", contato.id)
      .eq("connection_id", (conv as any).connection_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const historico = (msgs ?? []).reverse().map((m: any) => {
    const quem = m.direction === "in" ? "Paciente" : "Clínica";
    const texto = (m.content || "").trim() || (m.type && m.type !== "text" ? `[${m.type}]` : "");
    return `${quem} ${quando(m.message_at)}: ${texto}`;
  }).join("\n");
  const nome: string = contato.name && !/^\+?\d+$/.test(contato.name) ? contato.name : "";
  const contexto = `Paciente: ${nome || "nome não informado"}${contato.instagram_username ? ` (Instagram @${contato.instagram_username})` : ""}.
Lead: ${lead ? `etapa ${lead.status}${lead.intent ? `, interesse ${lead.intent}` : ""}${lead.source ? `, origem ${lead.source}` : ""}${lead.estimated_value ? `, valor estimado R$ ${lead.estimated_value}` : ""}` : "sem lead registrado"}.
Orçamentos: o sistema da clínica ainda não está ligado ao CRM; considere só o que aparece na conversa.
Conversa recente (mais antiga primeiro):
${historico || "(sem mensagens)"}`;

  const client = new Anthropic();

  try {
    if (acao === "caminhos") {
      const response = await client.messages.parse({
        model: MODELO,
        max_tokens: 16000,
        output_config: { effort: "medium", format: zodOutputFormat(CaminhosSchema) },
        system: SISTEMA,
        messages: [{
          role: "user",
          content: `${contexto}

Você é o coordenador comercial que orienta a recepção. Roteiros da clínica:
[NEGOCIAÇÃO] ${roteiros.negociacao}
[ATIVAÇÃO] ${roteiros.ativacao}
[CONFIRMAÇÃO] ${roteiros.confirmacao}

Responda com:
- resumo: 2 ou 3 frases sobre em que pé a conversa está, o que o paciente quer ou sente e o que está travando;
- etapa: em que etapa do roteiro estamos (gancho, descoberta, pitch, fechamento ou CTA) e por quê, em 1 frase;
- caminhos: de 2 a 3 caminhos realmente diferentes (ex.: descobrir a condição antes de falar de preço; manter o valor e facilitar o pagamento; ajustar o pacote; adiar com data marcada). Em cada um: titulo curto; quando (o que fazer e por que faz sentido, 1-2 frases); perguntas (1 ou 2 perguntas-gancho); fechamento (a frase de fechamento condicional ou a CTA); risco (1 frase); tipo (ativacao, confirmacao ou negociacao); instrucao (instrução objetiva para escrever a mensagem desse caminho).`,
        }],
      });
      if (response.stop_reason === "refusal") return json({ error: "O Claude não quis responder a este pedido." }, 200);
      if (!response.parsed_output) return json({ error: "Resposta fora do formato. Tente de novo." }, 200);
      const out = response.parsed_output;
      return json({ ok: true, ...out, caminhos: out.caminhos.slice(0, 3) });
    }

    // escrever
    const tipo = TIPOS[body.tipo] ? body.tipo as string : "ativacao";
    const extra = typeof body.extra === "string" ? body.extra.slice(0, 600).trim() : "";
    const assina = typeof body.assina === "string" && body.assina.trim() ? body.assina.trim().slice(0, 40) : "equipe do Instituto Vert";
    const primeiro = nome ? nome.split(" ")[0] : "";
    const response = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SISTEMA,
      messages: [{
        role: "user",
        content: `${contexto}

Escreva UMA mensagem de WhatsApp de ${TIPOS[tipo]}, continuando essa conversa, seguindo este roteiro da clínica:
${roteiros[tipo]}
Veja pela conversa em que etapa do roteiro estamos e escreva só o próximo passo: se ainda não sabemos o que trava o paciente, a mensagem é de descoberta (gancho + pergunta); se já sabemos a condição que ele quer, vá para o pitch + fechamento condicional + CTA. Toda mensagem termina com uma CTA clara.
${primeiro ? `Chame a pessoa de ${primeiro}.` : "Não sabemos o nome: cumprimente sem nome."}
${extra ? `Caminho escolhido pela clínica: ${extra}` : "Sem instrução extra: não ofereça desconto, brinde ou valor que não esteja no contexto."}
Quem assina: ${assina} (só assine se fizer sentido no tom da conversa).
Regras: tom natural de recepção, sem cara de robô; 2 a 6 frases curtas; no máximo um emoji (🤎 combina com a marca); não prometa resultado clínico.
Responda só com o texto da mensagem, sem aspas e sem comentários.`,
      }],
    });
    if (response.stop_reason === "refusal") return json({ error: "O Claude não quis escrever esta mensagem." }, 200);
    const texto = response.content.filter((b) => b.type === "text").map((b: any) => b.text).join("").trim();
    if (!texto) return json({ error: "O Claude não devolveu texto. Tente de novo." }, 200);
    return json({ ok: true, texto, modelo: response.model });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: "Muitos pedidos seguidos; espere um pouco." }, 200);
    if (error instanceof Anthropic.AuthenticationError) return json({ error: "A chave do Claude não foi aceita." }, 200);
    if (error instanceof Anthropic.APIError) {
      console.error("crm-ativacao", { status: error.status, message: error.message });
      return json({ error: "O Claude não respondeu agora. Tente de novo." }, 200);
    }
    console.error("crm-ativacao", String(error));
    return json({ error: "Não deu agora. Tente de novo." }, 200);
  }
});
