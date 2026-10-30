// Assistente de IA do CRM: resumir conversa, analisar (intenção/procedimento/objeção)
// e sugerir resposta — sempre com aprovação humana (nunca envia sozinha).
// Ancorado em dados reais da clínica (procedimentos + unidades) e no perfil de IA da instalação.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
// IA unificada: prioriza a OpenAI (ChatGPT); sem OPENAI_API_KEY cai no OpenRouter.
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  if (!OPENAI_API_KEY && !AI_API_KEY) return json({ error: "IA não configurada: defina o segredo OPENAI_API_KEY (ChatGPT) no Supabase." }, 200);

  const body = await req.json().catch(() => ({}));
  const conversationId = body.conversationId as string;
  const action = (body.action as string) || "suggest"; // summary | analyze | suggest
  const draft = (body.draft as string) || "";
  if (!conversationId) return json({ error: "missing conversationId" }, 400);

  // Permissão via RLS (JWT do usuário)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: conv, error: cErr } = await userClient
    .from("conversations")
    .select("id, organization_id, contact:crm_contacts(name)")
    .eq("id", conversationId).maybeSingle();
  if (cErr || !conv) return json({ error: "forbidden" }, 403);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const org = conv.organization_id;

  const [msgsRes, profRes, procRes, unitRes] = await Promise.all([
    db.from("messages").select("direction, content, message_at").eq("conversation_id", conversationId).order("message_at", { ascending: false }).limit(30),
    db.from("ai_profiles").select("base_prompt, tone").eq("organization_id", org).eq("is_active", true).limit(1).maybeSingle(),
    db.from("procedures").select("name, default_price").eq("organization_id", org).eq("active", true).order("name").limit(100),
    db.from("units").select("name").eq("organization_id", org),
  ]);

  const conversa = (msgsRes.data ?? []).reverse()
    .map((m: any) => `${m.direction === "out" ? "Clínica" : "Contato"}: ${m.content || "[mídia]"}`).join("\n");
  const procs = (procRes.data ?? [])
    .map((p: any) => `- ${p.name}: ${p.default_price != null ? "R$ " + Number(p.default_price).toFixed(2) : "sob consulta"}`).join("\n");
  const units = (unitRes.data ?? []).map((u: any) => u.name).filter(Boolean).join(", ");
  const basePrompt = profRes.data?.base_prompt || "Você é a assistente comercial de uma clínica odontológica no WhatsApp. Português do Brasil, tom cordial e profissional.";

  const guard = `Regras: nunca invente valores, horários ou procedimentos — use apenas os listados. Nunca dê diagnóstico nem prometa resultados. Não use dados de outro paciente.`;
  const contexto = `${basePrompt}\n${guard}\n\nPROCEDIMENTOS E VALORES:\n${procs || "(nenhum cadastrado)"}\nUNIDADES: ${units || "(não informado)"}\n\nCONVERSA RECENTE:\n${conversa || "(sem mensagens)"}`;

  let instruction = "";
  if (action === "summary") {
    instruction = `Resuma a conversa em até 4 linhas: interesse do contato, estágio do atendimento e próximo passo sugerido. Responda APENAS JSON: {"summary":"..."}`;
  } else if (action === "analyze") {
    instruction = `Analise a conversa. Responda APENAS JSON: {"intent":"...","procedure":"(procedimento de interesse ou vazio)","unit":"(unidade citada ou vazio)","objection":"(principal objeção ou vazio)","interest_level":"frio|morno|quente","urgency":"baixa|media|alta"}`;
  } else {
    instruction = `Redija a próxima melhor resposta ao contato, curta e cordial, avançando para avaliação/agendamento.${draft ? ` Melhore este rascunho mantendo a intenção: "${draft}".` : ""} Responda APENAS JSON: {"reply":"..."}`;
  }

  try {
    const resp = await fetch(OPENAI_API_KEY ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY || AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_API_KEY ? "gpt-4o-mini" : "google/gemini-2.5-flash",
        messages: [{ role: "user", content: `${contexto}\n\nINSTRUÇÃO: ${instruction}` }],
        response_format: { type: "json_object" },
      }),
    });
    if (resp.status === 429) return json({ error: "Limite de requisições da IA atingido. Tente em instantes." }, 200);
    if (resp.status === 402) return json({ error: "Créditos de IA esgotados." }, 200);
    if (!resp.ok) return json({ error: `Falha na IA (${resp.status}).` }, 200);

    const result = await resp.json();
    let content = result.choices?.[0]?.message?.content || "{}";
    content = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const outText = action === "summary" ? parsed.summary : action === "suggest" ? parsed.reply : JSON.stringify(parsed);
    await db.from("ai_suggestions").insert({
      organization_id: org, conversation_id: conversationId, kind: action,
      output: typeof outText === "string" ? outText : JSON.stringify(parsed),
      model: OPENAI_API_KEY ? "gpt-4o-mini" : "google/gemini-2.5-flash",
    });

    return json({ ok: true, action, ...parsed });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
