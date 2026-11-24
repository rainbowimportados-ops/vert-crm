// Cliente mínimo da API do Zernio (WhatsApp oficial do Meta) para as Edge Functions.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   ZERNIO_API_KEY         chave da API do workspace do Zernio onde o número está conectado
//   ZERNIO_WEBHOOK_SECRET  o mesmo "secret" cadastrado no webhook do Zernio
//
// A conexão do CRM aponta para a conta do Zernio pela coluna
// whatsapp_connections.zernio_account_id (provider = 'zernio').

export const ZERNIO_API = "https://zernio.com/api/v1";

export function zernioKey(): string {
  return Deno.env.get("ZERNIO_API_KEY") ?? "";
}

export type ZernioResult = { ok: boolean; status: number; data: any; error?: string };

export async function zernioFetch(path: string, init: { method?: string; body?: unknown } = {}): Promise<ZernioResult> {
  const key = zernioKey();
  if (!key) return { ok: false, status: 0, data: null, error: "ZERNIO_API_KEY não configurada" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const response = await fetch(`${ZERNIO_API}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ac.signal,
    });
    const text = await response.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }
    const error = response.ok ? undefined : describeError(data, response.status);
    return { ok: response.ok, status: response.status, data, error };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function describeError(data: any, status: number): string {
  const msg = data?.error?.message ?? data?.message ?? data?.error ?? null;
  const code = data?.error?.code ?? data?.code ?? null;
  const base = typeof msg === "string" ? msg : JSON.stringify(data ?? {}).slice(0, 400);
  return `HTTP ${status}${code ? ` ${code}` : ""}: ${base}`.slice(0, 600);
}

/** Tipo do CRM → attachmentType do Zernio. */
export function attachmentTypeFor(type: string): "image" | "video" | "audio" | "file" {
  if (type === "image" || type === "video" || type === "audio") return type;
  return "file";
}

/** attachments[].type do Zernio → tipo do CRM. */
export function crmTypeFor(type: unknown): "image" | "video" | "audio" | "document" {
  const t = String(type ?? "").toLowerCase();
  if (t.startsWith("image") || t === "sticker") return "image";
  if (t.startsWith("video")) return "video";
  if (t.startsWith("audio") || t === "voice") return "audio";
  return "document";
}

/** wamid devolvido pelo envio (é o que chega depois como platformMessageId nos webhooks). */
export function sentMessageId(data: any): string | null {
  const d = data?.data ?? data;
  return d?.platformMessageId ?? d?.messageId ?? d?.message?.platformMessageId ?? d?.id ?? null;
}

/**
 * Envia texto ou mídia numa conversa já aberta no Zernio.
 * Só funciona dentro da janela de 24h do WhatsApp (o paciente escreveu por último
 * há menos de 24h). Fora dela, o Meta só aceita template aprovado.
 */
export async function zernioSend(opts: {
  accountId: string;
  conversationId: string;
  text?: string;
  attachmentUrl?: string;
  attachmentType?: "image" | "video" | "audio" | "file";
  attachmentName?: string;
  voiceNote?: boolean;
}): Promise<ZernioResult> {
  const body: Record<string, unknown> = { accountId: opts.accountId };
  if (opts.text) body.message = opts.text;
  if (opts.attachmentUrl) {
    body.attachmentUrl = opts.attachmentUrl;
    body.attachmentType = opts.attachmentType ?? "file";
    if (opts.attachmentName && body.attachmentType === "file") body.attachmentName = opts.attachmentName;
    if (opts.voiceNote && body.attachmentType === "audio") body.voiceNote = true;
  }
  return await zernioFetch(`/inbox/conversations/${encodeURIComponent(opts.conversationId)}/messages`, {
    method: "POST",
    body,
  });
}

/**
 * Descobre o id da conversa no Zernio para um telefone.
 * Quem chama usa primeiro conversations.provider_conversation_id (gravado pelo
 * webhook); isto aqui é o plano B, procurando na lista de conversas da conta.
 */
export async function findZernioConversation(accountId: string, phoneDigits: string): Promise<string | null> {
  const alvo = phoneDigits.replace(/\D/g, "");
  if (!alvo) return null;
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ accountId, platform: "whatsapp", limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const r = await zernioFetch(`/inbox/conversations?${qs}`);
    if (!r.ok) return null;
    const list: any[] = r.data?.data ?? r.data?.conversations ?? [];
    for (const c of list) {
      const candidatos = [c?.participantId, c?.participant?.id, c?.participant?.phoneNumber, c?.participantUsername];
      if (candidatos.some((v) => typeof v === "string" && mesmoTelefone(v, alvo))) return String(c.id ?? c._id);
    }
    cursor = r.data?.pagination?.nextCursor ?? r.data?.nextCursor ?? "";
    if (!cursor) break;
  }
  return null;
}

/**
 * Compara telefones ignorando formatação. Celular brasileiro pode vir com ou sem
 * o nono dígito (o WhatsApp às vezes entrega 55 16 9xxxx-xxxx como 55 16 xxxx-xxxx).
 */
export function mesmoTelefone(a: string, b: string): boolean {
  const x = a.replace(/\D/g, "");
  const y = b.replace(/\D/g, "");
  if (!x || !y) return false;
  if (x === y) return true;
  const semNono = (n: string) => (n.length === 13 && n.startsWith("55") && n[4] === "9" ? n.slice(0, 4) + n.slice(5) : n);
  return semNono(x) === semNono(y);
}

/** HMAC-SHA256 do corpo cru, em hex minúsculo (cabeçalho X-Zernio-Signature). */
export async function assinaturaValida(rawBody: string, assinatura: string, secret: string): Promise<boolean> {
  if (!secret || !assinatura) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const esperado = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = assinatura.trim().toLowerCase();
  if (esperado.length !== recebido.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}

/** Link temporário (1h) de um arquivo do bucket crm-media, para o Zernio baixar e enviar. */
export async function urlTemporaria(db: any, mediaUrl: string | null | undefined): Promise<string | null> {
  if (!mediaUrl || !mediaUrl.startsWith("crm-media:")) return null;
  const caminho = mediaUrl.slice("crm-media:".length);
  const { data, error } = await db.storage.from("crm-media").createSignedUrl(caminho, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl as string;
}

/**
 * Envia um texto para o contato de uma conversa do CRM numa conexão Zernio
 * (usado pelo agente de IA e pelas mensagens automáticas).
 */
export async function zernioSendText(db: any, conn: { zernio_account_id?: string | null }, conv: { id: string; provider_conversation_id?: string | null }, phone: string, text: string): Promise<ZernioResult> {
  const accountId = conn.zernio_account_id ?? "";
  if (!accountId) return { ok: false, status: 0, data: null, error: "conexão sem zernio_account_id" };
  let conversationId = conv.provider_conversation_id ?? null;
  if (!conversationId) {
    conversationId = await findZernioConversation(accountId, phone);
    if (conversationId) await db.from("conversations").update({ provider_conversation_id: conversationId }).eq("id", conv.id);
  }
  if (!conversationId) return { ok: false, status: 0, data: null, error: "conversa não encontrada no Zernio (fora da janela de 24h, só template)" };
  return await zernioSend({ accountId, conversationId, text });
}
