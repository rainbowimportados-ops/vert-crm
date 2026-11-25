// Recebe os eventos da Zernio (WhatsApp oficial e Direct do Instagram) e grava no CRM.
//
// Eventos tratados:
//   message.received / message.sent -> crm_ingest_zernio (contato, conversa, mensagem)
//   message.delivered / message.read / message.failed -> crm_zernio_status
//
// Segurança: toda entrega vem assinada em X-Zernio-Signature (HMAC-SHA256 do
// corpo bruto com o segredo do webhook, que fica no Vault do banco ou em
// ZERNIO_WEBHOOK_SECRET). Sem assinatura válida, 401.
// A Zernio pede resposta em até 5 s: o trabalho pesado (baixar anexos) roda
// depois da resposta, em EdgeRuntime.waitUntil.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Tolera o valor colado com aspas, espaços ou quebra de linha no painel: o
// segredo da Zernio é hex de 64 caracteres; se estiver no meio de sobras, usa só ele.
const SEGREDO_BRUTO = (Deno.env.get("ZERNIO_WEBHOOK_SECRET") ?? "").trim();
const WEBHOOK_SECRET =
  SEGREDO_BRUTO.match(/[0-9a-f]{64}/i)?.[0] ?? SEGREDO_BRUTO.replace(/^["'`]+|["'`]+$/g, "").trim();
// Candidatos: o valor limpo, o bruto e cada trecho de 64 caracteres dele
// (cobre sobras coladas antes ou depois do segredo).
const SEGREDOS = Array.from(new Set([
  WEBHOOK_SECRET,
  SEGREDO_BRUTO,
  ...Array.from({ length: Math.max(0, SEGREDO_BRUTO.length - 63) }, (_, i) => SEGREDO_BRUTO.slice(i, i + 64)),
].filter(Boolean)));
const ZERNIO_API_KEY = (Deno.env.get("ZERNIO_API_KEY") ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

type Json = Record<string, any>;

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Segredo guardado no Vault do banco (crm_zernio_webhook_secret), lido uma vez
// por instância. Vale junto com o ZERNIO_WEBHOOK_SECRET das edge functions.
let segredoDoVault: Promise<string | null> | null = null;
function lerSegredoDoVault() {
  segredoDoVault ??= createClient(SUPABASE_URL, SERVICE_KEY)
    .rpc("crm_zernio_webhook_secret")
    .then(({ data, error }) => {
      if (error) console.error("zernio-webhook vault", error.message);
      return typeof data === "string" && data.trim() ? data.trim() : null;
    }, () => null);
  return segredoDoVault;
}

async function assinaturaValida(raw: string, recebida: string | null) {
  if (!recebida) return false;
  const vault = await lerSegredoDoVault();
  const segredos = vault ? [vault, ...SEGREDOS.filter((s) => s !== vault)] : SEGREDOS;
  if (!segredos.length) return false;
  // aceita "abc…", "sha256=abc…" e "t=…,v1=abc…"
  const candidatos = recebida.split(",").map((parte) => parte.trim().replace(/^(sha256|v1)=/i, ""));
  for (const segredo of segredos) {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const bruto = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
    const emHex = hex(bruto);
    const emBase64 = btoa(String.fromCharCode(...new Uint8Array(bruto)));
    if (candidatos.some((c) => iguais(c.toLowerCase(), emHex) || iguais(c, emBase64))) return true;
  }
  return false;
}

/** Tipo do anexo na Zernio -> tipo de mensagem no CRM. */
function tipoDoAnexo(att: Json | undefined): string {
  switch (att?.type) {
    case "image":
    case "sticker":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "file":
      return "document";
    default:
      return "text";
  }
}

function extensao(mime: string | null, tipo: string) {
  const m = (mime ?? "").split(";")[0].trim();
  const mapa: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "application/pdf": "pdf",
  };
  return mapa[m] ?? ({ image: "jpg", video: "mp4", audio: "ogg" } as Record<string, string>)[tipo] ?? "bin";
}

/** Baixa o anexo enquanto o link vale e guarda no bucket crm-media. */
async function guardarAnexo(db: SupabaseClient, orgId: string, messageId: string, att: Json, tipo: string, canal: string) {
  try {
    const headers: Record<string, string> = {};
    // No WhatsApp o link é um endpoint autenticado da Zernio; no Instagram é CDN aberto.
    if (canal === "whatsapp" || String(att.url).includes("zernio.com")) headers.Authorization = `Bearer ${ZERNIO_API_KEY}`;
    const resp = await fetch(att.url, { headers });
    if (!resp.ok) {
      console.error("zernio-webhook anexo", { messageId, status: resp.status });
      return;
    }
    const mime = att.mimeType || resp.headers.get("content-type") || "application/octet-stream";
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const { data: msg } = await db.from("messages").select("conversation_id").eq("id", messageId).maybeSingle();
    const path = `${orgId}/${msg?.conversation_id ?? "sem-conversa"}/${messageId}/anexo.${extensao(mime, tipo)}`;
    const { error } = await db.storage.from("crm-media").upload(path, bytes, {
      contentType: mime.split(";")[0].trim(), upsert: true,
    });
    if (error) {
      console.error("zernio-webhook upload", { messageId, error: error.message });
      return;
    }
    await db.from("messages").update({ media_url: `crm-media:${path}` }).eq("id", messageId);
  } catch (err) {
    console.error("zernio-webhook anexo falhou", { messageId, error: String(err) });
  }
}

async function tratarMensagem(db: SupabaseClient, evento: Json, conn: Json) {
  const m: Json = evento.message ?? {};
  const conv: Json = evento.conversation ?? {};
  const direction = m.direction === "outgoing" ? "out" : "in";
  const providerMsgId: string | null = m.platformMessageId || m.id || null;
  const anexo: Json | undefined = Array.isArray(m.attachments) ? m.attachments[0] : undefined;
  let tipo = tipoDoAnexo(anexo);
  let texto: string = m.text ?? "";
  if (anexo?.type === "share" && anexo.url) {
    tipo = "text";
    texto = [texto, anexo.url].filter(Boolean).join("\n");
  }
  if (evento.metadata?.isStoryMention) texto = texto || "Mencionou você no story";

  // Mensagem enviada pelo próprio CRM: já existe; só liga o id da plataforma.
  if (direction === "out" && m.sentVia === "api") {
    const ids = [m.id, m.platformMessageId].filter(Boolean);
    const { data: existente } = await db
      .from("messages")
      .select("id")
      .eq("organization_id", conn.organization_id)
      .in("provider_message_id", ids)
      .limit(1)
      .maybeSingle();
    if (existente) {
      await db.from("messages").update({ provider_message_id: providerMsgId, delivery_status: "sent" }).eq("id", existente.id);
      return;
    }
  }

  // WhatsApp: o participante é o telefone. Sem telefone (usuário com nome de
  // usuário), cai no BSUID, que não vira contato por telefone.
  const participante =
    conn.channel === "whatsapp"
      ? (conv.participantId || (direction === "in" ? m.sender?.phoneNumber || m.sender?.id : null) || "").replace(/^\+/, "")
      : conv.participantId || (direction === "in" ? m.sender?.id : null);

  const { data: msgId, error } = await db.rpc("crm_ingest_zernio", {
    _connection: conn.id,
    _participant_id: participante,
    _participant_username: conv.participantUsername ?? (direction === "in" ? m.sender?.username : null) ?? null,
    _participant_name: conv.participantName ?? (direction === "in" ? m.sender?.name : null) ?? null,
    _direction: direction,
    _content: texto,
    _provider_msg_id: providerMsgId,
    _msg_at: m.sentAt ?? evento.timestamp ?? new Date().toISOString(),
    _type: tipo,
    _provider_conv_id: conv.id ?? m.conversationId ?? null,
    _media_url: null,
  });
  if (error) throw error;
  if (msgId && anexo?.url && tipo !== "text") {
    await guardarAnexo(db, conn.organization_id, msgId as string, anexo, tipo, conn.channel);
  }
}

async function processar(db: SupabaseClient, evento: Json) {
  const tipo: string = evento.event ?? "";
  const accountId: string | undefined = evento.account?.accountId ?? evento.account?.id;
  if (!accountId) return;

  const { data: conn } = await db
    .from("whatsapp_connections")
    .select("id, organization_id, channel")
    .eq("provider", "zernio")
    .eq("instance_id", accountId)
    .eq("is_active", true)
    .maybeSingle();
  if (!conn) return; // conta da Zernio que não é do CRM

  // A Zernio pode repetir a entrega: o id do evento entra uma vez só.
  if (evento.id) {
    const { error: dup } = await db.from("provider_events").insert({
      organization_id: conn.organization_id,
      connection_id: conn.id,
      provider: "zernio",
      dedupe_key: `zernio:${evento.id}`,
      event_type: tipo,
    });
    if (dup) return;
  }

  if (tipo === "message.received" || tipo === "message.sent") {
    await tratarMensagem(db, evento, conn);
    return;
  }

  const status = ({ "message.delivered": "delivered", "message.read": "read", "message.failed": "failed" } as Record<string, string>)[tipo];
  if (status) {
    const m: Json = evento.message ?? {};
    const erro = m.error?.message ?? m.errorMessage ?? evento.error?.message ?? null;
    for (const id of [m.platformMessageId, m.id].filter(Boolean)) {
      await db.rpc("crm_zernio_status", { _org: conn.organization_id, _provider_msg_id: id, _status: status, _error: erro });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  const assinatura = req.headers.get("X-Zernio-Signature");
  if (!(await assinaturaValida(raw, assinatura))) {
    // diagnóstico sem expor segredo: só formato e tamanhos
    console.warn("zernio-webhook assinatura recusada", {
      temSegredo: WEBHOOK_SECRET.length > 0,
      temVault: !!(await lerSegredoDoVault()),
      tamanhoSegredo: WEBHOOK_SECRET.trim().length,
      tamanhoBruto: SEGREDO_BRUTO.length,
      // 8 primeiros hex do SHA-256 do segredo limpo: confere o valor sem revelá-lo
      impressao: hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(WEBHOOK_SECRET))).slice(0, 8),
      // caracteres fora do hex no valor bruto (aspas, espaços…), só os códigos
      sobras: Array.from(SEGREDO_BRUTO).filter((c) => !/[0-9a-f]/i.test(c)).map((c) => c.charCodeAt(0)),
      formato: assinatura ? assinatura.replace(/[0-9a-f]/gi, "x").slice(0, 24) : null,
      tamanhoAssinatura: assinatura?.length ?? 0,
    });
    return new Response(JSON.stringify({ error: "assinatura invalida" }), { status: 401 });
  }
  let evento: Json;
  try {
    evento = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "json invalido" }), { status: 400 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const trabalho = processar(db, evento).catch((err) =>
    console.error("zernio-webhook", { event: evento.event, id: evento.id, error: String(err?.message ?? err) })
  );
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(trabalho);
  else await trabalho;
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
