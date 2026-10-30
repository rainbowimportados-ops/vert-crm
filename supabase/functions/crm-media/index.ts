import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function safeName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "arquivo";
}
function extFor(mime: string) {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
    "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
  };
  return map[mime] || "bin";
}
function mimeParaStorage(value: string) {
  return (value.split(";")[0] || "").trim() || "application/octet-stream";
}

function decodeBase64(value: string) {
  const clean = value.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function records(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.messages?.records)) return value.messages.records;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  if (!messageId) return json({ error: "missing messageId" }, 400);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: user } = await userClient.auth.getUser();
  if (!user?.user) return json({ error: "unauthorized" }, 401);
  const { data: message, error: messageError } = await userClient
    .from("messages")
    .select("id, organization_id, conversation_id, type, content, media_url, provider_message_id, conversation:conversations(connection_id)")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError || !message) return json({ error: "Arquivo não encontrado." }, 404);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  let mediaUrl = message.media_url as string | null;
  let mimeType: string | null = null;
  let fileName = safeName((message.content as string) || `${message.type}-${message.id}`);

  if (!mediaUrl && message.provider_message_id) {
    const connectionId = (message as any).conversation?.connection_id;
    const { data: conn } = await db
      .from("whatsapp_connections")
      .select("instance_name, base_url, api_key")
      .eq("id", connectionId)
      .eq("organization_id", message.organization_id)
      .maybeSingle();
    const baseUrl = (conn?.base_url || EVOLUTION_BASE_URL || "").replace(/\/+$/, "");
    const apiKey = conn?.api_key || EVOLUTION_API_KEY;
    const instance = conn?.instance_name || "";
    if (baseUrl && apiKey && instance) {
      const headers = { "Content-Type": "application/json", apikey: apiKey };
      const providerId = message.provider_message_id as string;
      let providerMessage: any = { key: { id: providerId } };
      const find = await fetch(`${baseUrl}/chat/findMessages/${encodeURIComponent(instance)}`, {
        method: "POST", headers, body: JSON.stringify({ where: { key: { id: providerId } }, page: 1 }),
      });
      if (find.ok) {
        const found = records(await find.json().catch(() => ({}))).find((item) => item?.key?.id === providerId);
        if (found) providerMessage = found;
      }
      const mediaResponse = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
        method: "POST", headers, body: JSON.stringify({ message: providerMessage, convertToMp4: false }),
      });
      const mediaData = await mediaResponse.json().catch(() => ({}));
      const base64 = mediaData?.base64 || mediaData?.data?.base64;
      if (mediaResponse.ok && typeof base64 === "string" && base64.length <= 24_000_000) {
        mimeType = mimeParaStorage(mediaData?.mimetype || mediaData?.mimeType || "application/octet-stream");
        if (!fileName.includes(".")) fileName = `${fileName}.${extFor(mimeType)}`;
        const storagePath = `${message.organization_id}/${message.conversation_id}/${message.id}/${safeName(fileName)}`;
        const { error: uploadError } = await db.storage.from("crm-media").upload(storagePath, decodeBase64(base64), { contentType: mimeType, upsert: true });
        if (!uploadError) {
          mediaUrl = `crm-media:${storagePath}`;
          await db.from("messages").update({ media_url: mediaUrl }).eq("id", message.id);
        } else {
          console.error("crm-media cache upload", { messageId: message.id, error: uploadError.message });
          const clean = base64.replace(/^data:[^;]+;base64,/, "");
          return json({ ok: true, url: `data:${mimeType};base64,${clean}`, mimeType, fileName });
        }
      }
    }
  }

  if (!mediaUrl) return json({ ok: false, error: "O WhatsApp não disponibilizou mais este arquivo." }, 404);
  if (/^https?:\/\//.test(mediaUrl)) return json({ ok: true, url: mediaUrl, mimeType, fileName });
  const path = mediaUrl.replace(/^crm-media:/, "");
  const { data: signed, error: signError } = await db.storage.from("crm-media").createSignedUrl(path, 600);
  if (signError || !signed?.signedUrl) return json({ ok: false, error: "Não foi possível abrir o arquivo." }, 500);
  return json({ ok: true, url: signed.signedUrl, mimeType, fileName });
});
