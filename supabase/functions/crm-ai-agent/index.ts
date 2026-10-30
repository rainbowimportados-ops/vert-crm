// ============================================================
// Agente de IA do CRM (ChatGPT/OpenAI) — age SOZINHO, mas só
// quando ativado: interruptor geral em ai_agent_settings e modo
// por conversa (conversations.ai_mode: default | on | off).
//
// Funções (cada uma com sua chave em ai_agent_settings):
//   auto_reply    — responde a mensagem recebida via Evolution
//   auto_classify — analisa intenção/urgência e ajusta prioridade
//   auto_ocr      — lê comprovante (imagem) e registra nota interna
//
// Chamada interna (evolution-webhook -> aqui) com a service key.
// Sem OPENAI_API_KEY configurada, sai sem fazer nada.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function openai(model: string, messages: any[], apiKey: string): Promise<any> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const out = await resp.json();
  let content = out.choices?.[0]?.message?.content || "{}";
  content = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(content); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Somente chamadas internas (service key)
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_KEY}`) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const organizationId = body.organizationId as string;
  const connectionId = (body.connectionId as string) || null;
  const phone = (body.phone as string ?? "").replace(/\D/g, "");
  const providerMessageId = (body.providerMessageId as string) || null;
  const messageType = (body.messageType as string) || "text";
  if (!organizationId || !phone) return json({ error: "missing organizationId/phone" }, 400);
  if (!OPENAI_API_KEY) return json({ ok: true, skipped: "sem OPENAI_API_KEY" });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1) configurações — o agente só age quando ativado
  const { data: cfg } = await db.from("ai_agent_settings").select("*").eq("organization_id", organizationId).maybeSingle();
  if (!cfg) return json({ ok: true, skipped: "sem configurações" });

  // 2) conversa mais recente do contato (mesma normalização do banco)
  const norm = phone.length >= 12 && phone.startsWith("55") ? phone.slice(2) : phone;
  const { data: contact } = await db.from("crm_contacts")
    .select("id, name, phone").eq("organization_id", organizationId)
    .eq("phone_normalized", norm).is("deleted_at", null).limit(1).maybeSingle();
  if (!contact) return json({ ok: true, skipped: "contato não encontrado" });

  const { data: conv } = await db.from("conversations")
    .select("id, status, ai_mode, assignee_id, connection_id")
    .eq("organization_id", organizationId).eq("contact_id", contact.id)
    .match(connectionId ? { connection_id: connectionId } : {})
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (!conv) return json({ ok: true, skipped: "conversa não encontrada" });

  // regra "somente quando ativado":
  //   geral LIGADO  -> age, exceto conversa com ai_mode = off
  //   geral DESLIGADO -> só age em conversa com ai_mode = on
  const active = cfg.enabled ? conv.ai_mode !== "off" : conv.ai_mode === "on";
  if (!active) return json({ ok: true, skipped: "ia não ativada aqui" });

  // 3) mensagens recentes (contexto) — e anti-atropelo:
  //    se a última mensagem já é nossa (atendente respondeu), não age.
  const { data: msgs } = await db.from("messages")
    .select("direction, type, content, message_at, is_ai, provider_message_id")
    .eq("conversation_id", conv.id).order("message_at", { ascending: false }).limit(30);
  const recent = (msgs ?? []).slice().reverse();
  const last = recent[recent.length - 1];
  if (!last || last.direction !== "in") return json({ ok: true, skipped: "última mensagem não é do contato" });

  const aiCount = (msgs ?? []).filter((m: any) => m.is_ai).length;

  const results: Record<string, unknown> = {};

  // 4) OCR de comprovante (imagem) — registra nota interna
  let receiptInfo = "";
  if (cfg.auto_ocr && messageType === "image" && providerMessageId) {
    try {
      const { data: connRow } = await db.from("whatsapp_connections")
        .select("base_url, api_key, instance_name").eq("organization_id", organizationId)
        .eq("id", conv.connection_id).maybeSingle();
      if (connRow?.base_url && connRow?.api_key) {
        const mediaResp = await fetch(
          `${connRow.base_url.replace(/\/+$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(connRow.instance_name)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: connRow.api_key },
            body: JSON.stringify({ message: { key: { id: providerMessageId } }, convertToMp4: false }),
          },
        );
        const media = await mediaResp.json().catch(() => ({}));
        const b64 = media?.base64 ?? media?.media ?? null;
        if (b64) {
          const mime = media?.mimetype || "image/jpeg";
          const ocr = await openai(cfg.model, [{
            role: "user",
            content: [
              { type: "text", text: 'Esta imagem chegou por WhatsApp numa clínica odontológica. Se for um comprovante de pagamento (PIX, transferência, boleto), extraia os dados. Responda APENAS JSON: {"e_comprovante":true|false,"valor":"R$ ...","pagador":"...","data":"...","instituicao":"...","observacao":"..."}. Se não for comprovante, {"e_comprovante":false}.' },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          }], OPENAI_API_KEY);
          if (ocr?.e_comprovante) {
            const nota = `🤖 Comprovante lido pela IA: ${ocr.valor ?? "valor não identificado"}` +
              `${ocr.pagador ? ` · pagador: ${ocr.pagador}` : ""}${ocr.data ? ` · data: ${ocr.data}` : ""}` +
              `${ocr.instituicao ? ` · ${ocr.instituicao}` : ""}${ocr.observacao ? ` · ${ocr.observacao}` : ""}`;
            await db.from("internal_notes").insert({
              organization_id: organizationId, conversation_id: conv.id, contact_id: contact.id, body: nota, author_id: null,
            });
            await db.from("ai_suggestions").insert({
              organization_id: organizationId, conversation_id: conv.id, kind: "ocr_receipt",
              output: JSON.stringify(ocr), model: cfg.model,
            });
            receiptInfo = `O contato acabou de enviar um comprovante de pagamento (${ocr.valor ?? "valor não identificado"}). Confirme o recebimento com educação.`;
            results.ocr = ocr;
          }
        }
      }
    } catch (e) { results.ocrError = String(e); }
  }

  // 5) contexto da clínica (mesma âncora do assistente manual)
  const [profRes, procRes, unitRes] = await Promise.all([
    db.from("ai_profiles").select("base_prompt, tone").eq("organization_id", organizationId).eq("is_active", true).limit(1).maybeSingle(),
    db.from("procedures").select("name, default_price").eq("organization_id", organizationId).eq("active", true).order("name").limit(100),
    db.from("units").select("name").eq("organization_id", organizationId),
  ]);
  const conversa = recent.map((m: any) => `${m.direction === "out" ? "Clínica" : "Contato"}: ${m.content || "[mídia]"}`).join("\n");
  const procs = (procRes.data ?? []).map((p: any) => `- ${p.name}: ${p.default_price != null ? "R$ " + Number(p.default_price).toFixed(2) : "sob consulta"}`).join("\n");
  const units = (unitRes.data ?? []).map((u: any) => u.name).filter(Boolean).join(", ");
  const basePrompt = profRes.data?.base_prompt || "Você é a assistente comercial de uma clínica odontológica no WhatsApp. Português do Brasil, tom cordial e profissional.";
  const guard = "Regras: nunca invente valores, horários ou procedimentos — use apenas os listados. Nunca dê diagnóstico nem prometa resultados. Não use dados de outro paciente. Se o assunto fugir do atendimento da clínica ou exigir um humano, diga que vai chamar um atendente.";
  const contexto = `${basePrompt}\n${guard}\n${cfg.extra_prompt ? `Instruções da clínica: ${cfg.extra_prompt}\n` : ""}` +
    `\nPROCEDIMENTOS E VALORES:\n${procs || "(nenhum cadastrado)"}\nUNIDADES: ${units || "(não informado)"}` +
    `${receiptInfo ? `\n\nAVISO: ${receiptInfo}` : ""}\n\nCONVERSA RECENTE:\n${conversa || "(sem mensagens)"}`;

  // 6) classificar e priorizar
  if (cfg.auto_classify) {
    try {
      const a = await openai(cfg.model, [{
        role: "user",
        content: `${contexto}\n\nINSTRUÇÃO: Analise a conversa. Responda APENAS JSON: {"intent":"...","procedure":"(procedimento de interesse ou vazio)","objection":"(principal objeção ou vazio)","interest_level":"frio|morno|quente","urgency":"baixa|media|alta"}`,
      }], OPENAI_API_KEY);
      await db.from("ai_suggestions").insert({
        organization_id: organizationId, conversation_id: conv.id, kind: "auto_analyze",
        output: JSON.stringify(a), model: cfg.model,
      });
      const prio = a?.urgency === "alta" ? "alta" : a?.urgency === "media" ? "media" : a?.urgency === "baixa" ? "baixa" : null;
      if (prio) await db.from("conversations").update({ priority: prio }).eq("id", conv.id);
      results.analyze = a;
    } catch (e) { results.analyzeError = String(e); }
  }

  // 7) responder
  if (cfg.auto_reply) {
    if (aiCount >= (cfg.max_replies_per_conversation ?? 20)) {
      results.reply = "limite de respostas automáticas atingido nesta conversa";
    } else {
      try {
        const r = await openai(cfg.model, [{
          role: "user",
          content: `${contexto}\n\nINSTRUÇÃO: Redija a próxima resposta ao contato, curta e cordial, avançando o atendimento (avaliação/agendamento) sem pressionar. Além da resposta, você PODE executar ações no CRM quando fizer sentido:
- {"tipo":"etiqueta","valor":"<nome de uma etiqueta existente>"} — marcar interesse detectado
- {"tipo":"prioridade","valor":"baixa|media|alta"} — ajustar a urgência da conversa
- {"tipo":"followup","quando":"<data-hora ISO futura>","nota":"..."} — agendar um retorno
- {"tipo":"chamar_atendente","motivo":"..."} — quando o assunto exigir um humano (reclamação, negociação difícil, urgência clínica)
Responda APENAS JSON: {"reply":"...","acoes":[...]} (acoes pode ser lista vazia).`,
        }], OPENAI_API_KEY);
        // executa as ações que a IA decidiu (todas reversíveis e auditadas)
        const acoes: any[] = Array.isArray(r?.acoes) ? r.acoes.slice(0, 4) : [];
        for (const a of acoes) {
          try {
            if (a?.tipo === "prioridade" && ["baixa", "media", "alta"].includes(a.valor)) {
              await db.from("conversations").update({ priority: a.valor }).eq("id", conv.id);
            } else if (a?.tipo === "etiqueta" && a.valor) {
              const { data: tag } = await db.from("tags").select("id")
                .eq("organization_id", organizationId).ilike("label", String(a.valor)).limit(1).maybeSingle();
              if (tag) await db.from("contact_tags").upsert(
                { organization_id: organizationId, contact_id: contact.id, tag_id: tag.id },
                { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
            } else if (a?.tipo === "followup" && a.quando) {
              const due = new Date(a.quando);
              if (!isNaN(due.getTime()) && due.getTime() > Date.now()) {
                await db.from("followups").insert({
                  organization_id: organizationId, conversation_id: conv.id, contact_id: contact.id,
                  due_at: due.toISOString(), note: `🤖 IA: ${a.nota ?? "retorno agendado"}`,
                });
              }
            } else if (a?.tipo === "chamar_atendente") {
              await db.from("conversations").update({ priority: "alta", status: "aguardando" }).eq("id", conv.id);
              await db.from("internal_notes").insert({
                organization_id: organizationId, conversation_id: conv.id, contact_id: contact.id,
                body: `🤖 IA pediu atendimento humano: ${a.motivo ?? "assunto sensível"}`, author_id: null,
              });
            }
          } catch { /* ação individual nunca derruba a resposta */ }
        }
        if (acoes.length) {
          await db.from("ai_suggestions").insert({
            organization_id: organizationId, conversation_id: conv.id, kind: "auto_actions",
            output: JSON.stringify(acoes), model: cfg.model,
          });
          results.acoes = acoes;
        }
        const texto = (r?.reply ?? "").toString().trim();
        if (texto) {
          // alguém respondeu enquanto a IA pensava? então não envia
          const { data: newer } = await db.from("messages")
            .select("id").eq("conversation_id", conv.id).eq("direction", "out")
            .gt("message_at", last.message_at).limit(1);
          if ((newer ?? []).length === 0) {
            const nowIso = new Date().toISOString();
            const { data: msg } = await db.from("messages").insert({
              organization_id: organizationId, conversation_id: conv.id, direction: "out",
              type: "text", content: texto, delivery_status: "pending", message_at: nowIso, is_ai: true,
            }).select("id").single();
            const { data: connRow } = await db.from("whatsapp_connections")
              .select("base_url, api_key, instance_name").eq("organization_id", organizationId)
              .eq("id", conv.connection_id).maybeSingle();
            if (connRow?.base_url && connRow?.api_key && msg) {
              const resp = await fetch(`${connRow.base_url.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(connRow.instance_name)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: connRow.api_key },
                body: JSON.stringify({ number: contact.phone.replace(/\D/g, ""), text: texto }),
              });
              const out = await resp.json().catch(() => ({}));
              if (resp.ok) {
                await db.from("messages").update({ delivery_status: "sent", provider_message_id: out?.key?.id ?? null }).eq("id", msg.id);
                await db.from("conversations").update({
                  last_message_preview: texto.slice(0, 120), last_message_at: nowIso,
                  status: conv.status === "finalizado" ? "novo" : conv.status,
                }).eq("id", conv.id);
                results.reply = texto;
              } else {
                await db.from("messages").update({ delivery_status: "failed" }).eq("id", msg.id);
                results.replyError = out?.message || `HTTP ${resp.status}`;
              }
            }
          } else {
            results.reply = "atendente respondeu antes — envio cancelado";
          }
        }
      } catch (e) { results.replyError = String(e); }
    }
  }

  return json({ ok: true, ...results });
});
