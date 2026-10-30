// Envio de texto e mídia pelo CRM (atendente -> backend -> Evolution).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function mediaLabel(type: string, fileName?: string, duration?: number) {
  if (type === "audio") return duration ? `Áudio · ${duration}s` : "Áudio";
  if (type === "image") return "Imagem";
  if (type === "video") return "Vídeo";
  return fileName ? `Documento · ${fileName}` : "Documento";
}

function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "arquivo";
}

function mimeParaStorage(value: string) {
  return (value.split(";")[0] || "").trim() || "application/octet-stream";
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const conversationId = body.conversationId as string;
  const type = ((body.type as string) || "text").toLowerCase();
  const textContent = ((body.content as string) ?? "").trim();
  const mediaBase64 = ((body.mediaBase64 as string) ?? "").replace(
    /^data:[^;]+;base64,/,
    "",
  );
  const mimeType =
    (body.mimeType as string) ||
    (type === "audio" ? "audio/webm" : "application/octet-stream");
  const fileName = ((body.fileName as string) || `${type}-${Date.now()}`).slice(
    0,
    180,
  );
  const duration = Number(body.duration ?? 0) || 0;
  const isMedia = ["audio", "image", "video", "document"].includes(type);
  if (!conversationId || (!textContent && !isMedia))
    return json({ error: "missing conversationId/content" }, 400);
  if (isMedia && !mediaBase64)
    return json({ error: "missing mediaBase64" }, 400);
  if (mediaBase64.length > 24_000_000)
    return json(
      {
        error: "media_too_large",
        message: "Arquivo maior que o limite de 18 MB.",
      },
      413,
    );

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const userId = userRes?.user?.id ?? null;

  const { data: conv, error: convErr } = await userClient
    .from("conversations")
    .select("id, organization_id, connection_id, contact:crm_contacts(phone)")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr || !conv) return json({ error: "forbidden" }, 403);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();
  const preview = textContent || mediaLabel(type, fileName, duration);
  const messageContent = type === "text" ? textContent : preview;

  const { data: msg, error: insErr } = await db
    .from("messages")
    .insert({
      organization_id: conv.organization_id,
      conversation_id: conversationId,
      direction: "out",
      type,
      content: messageContent,
      sender_user_id: userId,
      delivery_status: "pending",
      message_at: nowIso,
    })
    .select("id")
    .single();
  if (insErr) return json({ error: insErr.message }, 500);

  if (isMedia) {
    try {
      const storagePath = `${conv.organization_id}/${conversationId}/${msg.id}/${safeFileName(fileName)}`;
      const { error: uploadError } = await db.storage
        .from("crm-media")
        .upload(storagePath, decodeBase64(mediaBase64), {
          contentType: mimeParaStorage(mimeType),
          upsert: true,
        });
      if (!uploadError) {
        await db.from("messages").update({ media_url: `crm-media:${storagePath}` }).eq("id", msg.id);
      } else {
        console.error("crm-send-message media upload", { messageId: msg.id, error: uploadError.message });
      }
    } catch (storageError) {
      console.error("crm-send-message media storage", { messageId: msg.id, error: String(storageError) });
    }
  }

  await db
    .from("conversations")
    .update({
      last_message_preview: preview.slice(0, 120),
      last_message_at: nowIso,
    })
    .eq("id", conversationId);

  const { data: connRow } = await db
    .from("whatsapp_connections")
    .select("instance_name, base_url, status, api_key")
    .eq("organization_id", conv.organization_id)
    .eq("id", conv.connection_id)
    .maybeSingle();

  const baseUrl = (connRow?.base_url || EVOLUTION_BASE_URL || "").replace(
    /\/+$/,
    "",
  );
  const instance = connRow?.instance_name || "";
  const apiKey = (connRow as any)?.api_key || EVOLUTION_API_KEY;
  const phone = (conv as any).contact?.phone?.replace(/\D/g, "") ?? "";

  if (!baseUrl || !apiKey || !instance || !phone)
    return json({
      ok: true,
      sent: false,
      queued: true,
      reason: "no_connection",
      messageId: msg.id,
    });

  const request = async (path: string, payload: Record<string, unknown>) => {
    const response = await fetch(
      `${baseUrl}${path}/${encodeURIComponent(instance)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(payload),
      },
    );
    const output = await response.json().catch(() => ({}));
    return { response, output };
  };

  try {
    let result: { response: Response; output: any };
    if (type === "text") {
      result = await request("/message/sendText", {
        number: phone,
        text: textContent,
      });
    } else if (type === "audio") {
      // Evolution v2 espera base64 puro ou URL — prefixo data: derruba a validacao.
      result = await request("/message/sendWhatsAppAudio", {
        number: phone,
        audio: mediaBase64,
        encoding: true,
      });
      if (
        !result.response.ok &&
        [400, 404, 405].includes(result.response.status)
      ) {
        result = await request("/message/sendMedia", {
          number: phone,
          mediatype: "audio",
          mimetype: mimeType,
          media: mediaBase64,
          fileName,
        });
      }
    } else {
      const mediatype = type === "document" ? "document" : type;
      result = await request("/message/sendMedia", {
        number: phone,
        mediatype,
        mimetype: mimeType,
        media: mediaBase64,
        fileName,
        caption: textContent || undefined,
      });
    }

    if (!result.response.ok) {
      const detalhe =
        typeof result.output?.message === "string"
          ? result.output.message
          : JSON.stringify(result.output?.response ?? result.output ?? {}).slice(0, 500);
      await db
        .from("messages")
        .update({
          delivery_status: "failed",
          delivery_error: `HTTP ${result.response.status}: ${detalhe}`.slice(0, 600),
        })
        .eq("id", msg.id);
      return json(
        {
          ok: false,
          sent: false,
          messageId: msg.id,
          error: result.output?.message || `HTTP ${result.response.status}`,
        },
        200,
      );
    }
    const providerId = result.output?.key?.id ?? null;
    await db
      .from("messages")
      .update({ delivery_status: "sent", provider_message_id: providerId })
      .eq("id", msg.id);
    return json({
      ok: true,
      sent: true,
      messageId: msg.id,
      providerMessageId: providerId,
      type,
    });
  } catch (error) {
    await db
      .from("messages")
      .update({ delivery_status: "failed", delivery_error: String(error).slice(0, 600) })
      .eq("id", msg.id);
    return json(
      { ok: false, sent: false, messageId: msg.id, error: String(error) },
      200,
    );
  }
});
