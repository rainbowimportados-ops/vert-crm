// Webhook de ENTRADA do Zernio (WhatsApp oficial do Meta).
//
// Cadastro no Zernio (uma vez, para o workspace todo):
//   URL:     https://<projeto>.supabase.co/functions/v1/zernio-webhook
//   Eventos: message.received, message.sent, message.delivered, message.read, message.failed
//   Secret:  o mesmo valor do segredo ZERNIO_WEBHOOK_SECRET
//
// A função descobre a conexão do CRM pela conta do Zernio (account.id) e grava
// tudo pela mesma crm_ingest_message que a Evolution usa — a tela do CRM não muda.
// Precisa ser publicada com verify_jwt = false (o Zernio não manda JWT do Supabase).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assinaturaValida, crmTypeFor, zernioSendText } from "../_shared/zernio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ZERNIO_WEBHOOK_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function emSegundoPlano(task: Promise<unknown>) {
  const segura = task.catch(() => undefined);
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(segura);
  else await segura;
}

function digitos(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "");
  return /^\d{8,15}$/.test(d) ? d : null;
}

/** Mesma regra da crm_normalize_phone do banco: tira o 55 de números brasileiros. */
function normalizado(phone: string): string {
  return phone.length >= 12 && phone.startsWith("55") ? phone.slice(2) : phone;
}

function nomeLimpo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || /^\+?\d[\d\s().-]*$/.test(s)) return null;
  return s;
}

function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "arquivo";
}

function extensao(mime: string) {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/3gpp": "3gp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/aac": "aac", "audio/amr": "amr", "application/pdf": "pdf", "text/plain": "txt",
  };
  return map[(mime.split(";")[0] || "").trim()] || "bin";
}

/** Telefone do contato (a outra ponta), seja mensagem recebida ou enviada. */
function telefoneDoContato(payload: any, direction: "in" | "out"): string | null {
  const m = payload?.message ?? {};
  const c = payload?.conversation ?? {};
  const candidatos = direction === "in"
    ? [m?.sender?.phoneNumber, m?.sender?.id, c?.participantId, c?.participant?.phoneNumber]
    : [m?.recipient?.phoneNumber, m?.recipient?.id, m?.participantId, c?.participantId, c?.participant?.phoneNumber, c?.participant?.id];
  for (const v of candidatos) {
    const d = digitos(v);
    if (d) return d;
  }
  return null;
}

/** Baixa a cópia da mídia hospedada pelo Zernio e guarda no bucket crm-media. */
async function guardaMidia(db: any, orgId: string, messageId: string, conversationId: string, anexo: any, tipo: string) {
  const url = anexo?.url ?? anexo?.payload?.url ?? null;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return;
  try {
    const resp = await fetch(url);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (!resp.ok || !bytes.length || bytes.length > 18_000_000) return;
    const mime = anexo?.mimeType ?? anexo?.mime_type ?? resp.headers.get("content-type") ?? "application/octet-stream";
    const nome = safeFileName(anexo?.name ?? anexo?.fileName ?? anexo?.filename ?? `${tipo}-${messageId}.${extensao(mime)}`);
    const caminho = `${orgId}/${conversationId}/${messageId}/${nome}`;
    const { error } = await db.storage.from("crm-media").upload(caminho, bytes, { contentType: (mime.split(";")[0] || mime).trim(), upsert: true });
    if (!error) await db.from("messages").update({ media_url: `crm-media:${caminho}` }).eq("id", messageId);
  } catch (erro) {
    console.error("zernio-webhook midia", { messageId, erro: String(erro) });
  }
}

/** Saudação para contato novo e ausência fora do horário (mesma regra da evolution-webhook). */
async function mensagensAutomaticas(db: any, conn: any, phone: string, msgId: string) {
  try {
    const { data: cfg } = await db.from("crm_auto_messages").select("*").eq("organization_id", conn.organization_id).maybeSingle();
    if (!cfg || (!cfg.greeting_enabled && !cfg.away_enabled)) return;
    const { data: ai } = await db.from("ai_agent_settings").select("enabled, auto_reply").eq("organization_id", conn.organization_id).maybeSingle();
    const { data: msg } = await db.from("messages").select("conversation_id").eq("id", msgId).maybeSingle();
    if (!msg) return;
    const { data: conv } = await db.from("conversations")
      .select("id, greeted_at, away_sent_at, ai_mode, provider_conversation_id, contact:crm_contacts(id, name, phone)")
      .eq("id", msg.conversation_id).maybeSingle();
    if (!conv?.contact) return;
    if (!!ai?.enabled && !!ai?.auto_reply && conv.ai_mode !== "off") return; // o agente de IA assume

    const parts = new Intl.DateTimeFormat("en-US", { timeZone: cfg.timezone || "America/Sao_Paulo", hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date());
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
    const hhmm = `${parts.find((p) => p.type === "hour")?.value ?? "00"}:${parts.find((p) => p.type === "minute")?.value ?? "00"}`;
    const range = (cfg.business_hours ?? {})[String(wd)];
    const dentroDoHorario = Array.isArray(range) && range.length === 2 && hhmm >= range[0] && hhmm < range[1];

    const nome = (conv.contact.name ?? "").trim();
    const primeiroNome = nome && !/^[\d\s()+-]*$/.test(nome) ? nome.split(/\s+/)[0] : "";
    const preenche = (t: string) => t
      .replaceAll("{nome_cliente}", primeiroNome || "tudo bem")
      .replaceAll("{horario}", Object.entries(cfg.business_hours ?? {}).map(([d, r]: [string, any]) =>
        `${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][Number(d)]} ${r?.[0]}–${r?.[1]}`).join(", "));
    // A mensagem volta ao CRM pelo próprio evento message.sent.
    const envia = async (texto: string) => (await zernioSendText(db, conn, conv, phone, texto)).ok;

    if (cfg.greeting_enabled && !conv.greeted_at) {
      const { count } = await db.from("messages").select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id).eq("direction", "out");
      if ((count ?? 0) === 0 && dentroDoHorario && await envia(preenche(cfg.greeting_text))) {
        await db.from("conversations").update({ greeted_at: new Date().toISOString() }).eq("id", conv.id);
        return;
      }
    }
    if (cfg.away_enabled && !dentroDoHorario) {
      const ultima = conv.away_sent_at ? new Date(conv.away_sent_at).getTime() : 0;
      if (Date.now() - ultima > 12 * 3600_000 && await envia(preenche(cfg.away_text))) {
        await db.from("conversations").update({ away_sent_at: new Date().toISOString() }).eq("id", conv.id);
      }
    }
  } catch { /* nunca derruba o webhook */ }
}

const ORDEM_STATUS: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

async function atualizaStatus(db: any, orgId: string, payload: any, evento: string) {
  const m = payload?.message ?? {};
  const ids = [m?.platformMessageId, m?.id, payload?.platformMessageId, payload?.messageId].filter((v) => typeof v === "string" && v);
  if (!ids.length) return 0;
  const { data: linhas } = await db.from("messages").select("id, delivery_status")
    .eq("organization_id", orgId).in("provider_message_id", ids);
  let n = 0;
  for (const linha of linhas ?? []) {
    if (evento === "message.failed") {
      const erro = m?.error?.message ?? m?.errorMessage ?? payload?.error?.message ?? payload?.error ?? "falha no envio";
      await db.from("messages").update({ delivery_status: "failed", delivery_error: String(typeof erro === "string" ? erro : JSON.stringify(erro)).slice(0, 600) }).eq("id", linha.id);
      n++;
      continue;
    }
    const novo = evento === "message.read" ? "read" : "delivered";
    if ((ORDEM_STATUS[linha.delivery_status] ?? 0) < ORDEM_STATUS[novo]) {
      await db.from("messages").update({ delivery_status: novo }).eq("id", linha.id);
      n++;
    }
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const raw = await req.text();
  const assinatura = req.headers.get("X-Zernio-Signature") ?? req.headers.get("X-Late-Signature") ?? "";
  if (!(await assinaturaValida(raw, assinatura, WEBHOOK_SECRET))) return json({ error: "invalid signature" }, 401);

  let payload: any = {};
  try { payload = JSON.parse(raw || "{}"); } catch { return json({ error: "invalid json" }, 400); }
  const evento = String(payload?.event ?? payload?.type ?? "unknown");
  const plataforma = payload?.message?.platform ?? payload?.account?.platform ?? "whatsapp";
  if (plataforma !== "whatsapp") return json({ ok: true, ignored: "not whatsapp" });

  const accountId = payload?.account?.id ?? payload?.account?.accountId ?? payload?.accountId ?? null;
  if (!accountId) return json({ ok: true, ignored: "sem account" });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: conn } = await db.from("whatsapp_connections")
    .select("id, organization_id, zernio_account_id, is_active")
    .eq("provider", "zernio").eq("zernio_account_id", String(accountId)).maybeSingle();
  // 200 para o Zernio não ficar reenviando eventos de uma conta que o CRM não usa.
  if (!conn || !conn.is_active) return json({ ok: true, ignored: "conta não ligada ao CRM" });

  // Deduplicação: o Zernio reenvia até 7 vezes; o id do evento é estável.
  const eventoId = payload?.id ?? req.headers.get("X-Zernio-Event-Id") ?? null;
  if (eventoId) {
    const { error: dup } = await db.from("provider_events").insert({
      organization_id: conn.organization_id, connection_id: conn.id, provider: "zernio",
      dedupe_key: String(eventoId), event_type: evento,
    });
    if (dup) return json({ ok: true, duplicated: true });
  }
  await db.from("webhook_inbox").insert({ organization_id: conn.organization_id, connection_id: conn.id, provider: "zernio", event_type: evento, payload });

  if (evento === "message.delivered" || evento === "message.read" || evento === "message.failed") {
    const n = await atualizaStatus(db, conn.organization_id, payload, evento);
    return json({ ok: true, event: evento, updated: n });
  }

  if (evento !== "message.received" && evento !== "message.sent") return json({ ok: true, event: evento, handled: false });

  const m = payload?.message ?? {};
  const direction: "in" | "out" = evento === "message.received" ? "in" : "out";
  // Agente do Meta em modo standby: a conversa é dele, não do CRM.
  if (m?.metadata?.standby) return json({ ok: true, ignored: "standby" });

  const conversaZernio: string | null = m?.conversationId ?? payload?.conversation?.id ?? null;
  let phone = telefoneDoContato(payload, direction);
  if (!phone && conversaZernio) {
    // mensagem enviada sem telefone no evento: acha pela conversa já conhecida
    const { data: c } = await db.from("conversations").select("contact:crm_contacts(phone)")
      .eq("organization_id", conn.organization_id).eq("provider_conversation_id", conversaZernio).limit(1).maybeSingle();
    phone = digitos((c as any)?.contact?.phone) ?? null;
  }
  if (!phone) return json({ ok: true, ignored: "sem telefone" });

  const anexos: any[] = Array.isArray(m?.attachments) ? m.attachments : [];
  const tipo = anexos.length ? crmTypeFor(anexos[0]?.type) : "text";
  const rotulo: Record<string, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento" };
  const conteudo = (typeof m?.text === "string" && m.text) ? m.text : (tipo !== "text" ? rotulo[tipo] : "");
  const providerId = m?.platformMessageId ?? m?.id ?? null;
  const quandoBruto = m?.createdAt ?? m?.timestamp ?? payload?.timestamp ?? null;
  const quando = quandoBruto && !Number.isNaN(new Date(quandoBruto).getTime()) ? new Date(quandoBruto).toISOString() : new Date().toISOString();
  const pushName = direction === "in" ? nomeLimpo(m?.sender?.name) : null;

  // Mensagem que o próprio CRM acabou de mandar: o message.sent pode chegar antes de
  // a crm-send-message gravar o wamid. Casa com a linha pendente em vez de duplicar.
  if (direction === "out" && providerId && conversaZernio) {
    const { data: convCrm } = await db.from("conversations").select("id")
      .eq("organization_id", conn.organization_id).eq("provider_conversation_id", conversaZernio).limit(1).maybeSingle();
    if (convCrm) {
      const desde = new Date(Date.now() - 5 * 60_000).toISOString();
      let busca = db.from("messages").select("id")
        .eq("conversation_id", convCrm.id).eq("direction", "out").is("provider_message_id", null)
        .gte("created_at", desde).order("created_at", { ascending: false }).limit(1);
      busca = tipo === "text" ? busca.eq("content", conteudo) : busca.eq("type", tipo);
      const { data: pendente } = await busca.maybeSingle();
      if (pendente) {
        await db.from("messages").update({ provider_message_id: providerId, delivery_status: "sent" }).eq("id", pendente.id);
        return json({ ok: true, event: evento, matched: pendente.id });
      }
    }
  }

  const { data: msgId, error } = await db.rpc("crm_ingest_message", {
    _org: conn.organization_id, _connection: conn.id, _phone: phone, _push_name: pushName,
    _direction: direction, _content: conteudo, _provider_msg_id: providerId,
    _msg_at: quando, _type: tipo,
  });
  if (error) return json({ error: error.message }, 500);

  // Guarda o id da conversa do Zernio: é por ele que o CRM responde.
  if (conversaZernio) {
    const { data: contato } = await db.from("crm_contacts").select("id")
      .eq("organization_id", conn.organization_id).eq("phone_normalized", normalizado(phone)).is("deleted_at", null).limit(1).maybeSingle();
    if (contato) {
      await db.from("conversations").update({ provider_conversation_id: conversaZernio })
        .eq("organization_id", conn.organization_id).eq("connection_id", conn.id).eq("contact_id", contato.id);
    }
  }

  if (!msgId) return json({ ok: true, event: evento, duplicated: true });

  // Mídia antes da IA: o OCR do agente lê o arquivo já guardado no bucket.
  if (anexos.length) {
    const { data: salvo } = await db.from("messages").select("conversation_id").eq("id", msgId).maybeSingle();
    if (salvo?.conversation_id) await guardaMidia(db, conn.organization_id, msgId as string, salvo.conversation_id, anexos[0], tipo);
  }

  if (direction === "in") {
    await emSegundoPlano(mensagensAutomaticas(db, conn, phone, msgId as string));
    // Agente de IA: ele mesmo decide se está ligado (interruptor geral + modo da conversa).
    await emSegundoPlano(fetch(`${SUPABASE_URL}/functions/v1/crm-ai-agent`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: conn.organization_id, phone, providerMessageId: providerId, messageType: tipo }),
    }));
  }

  return json({ ok: true, event: evento, messageId: msgId });
});
