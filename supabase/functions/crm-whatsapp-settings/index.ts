import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return json({ ok: false, message: "Não autenticado." }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData } = await userClient.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return json({ ok: false, message: "Sessão inválida." }, 401);

  const { data: profile } = await userClient
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  const organizationId = profile?.organization_id;
  if (!organizationId) return json({ ok: false, message: "Organização não encontrada." }, 403);

  const { data: roleData } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!roleData || !["admin", "super_admin", "gestor"].includes(roleData.role)) {
    return json({ ok: false, message: "Sem permissão para sincronizar." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action === "auto_messages" ? "auto_messages" : "quick_replies";
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: connection } = await db
    .from("whatsapp_connections")
    .select("id, status, base_url, api_key, instance_name")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();

  if (!connection?.base_url || !connection?.api_key || !connection?.instance_name) {
    return json({ ok: false, message: "Conecte uma instância do WhatsApp antes de sincronizar." });
  }

  const baseUrl = connection.base_url.replace(/\/+$/, "");
  const stateResponse = await fetch(
    `${baseUrl}/instance/connectionState/${encodeURIComponent(connection.instance_name)}`,
    { headers: { apikey: connection.api_key } },
  ).catch(() => null);
  const statePayload = await stateResponse?.json().catch(() => ({}));
  const state = statePayload?.instance?.state ?? statePayload?.state ?? connection.status;
  if (!stateResponse?.ok || state !== "open") {
    return json({ ok: false, message: "O WhatsApp está desconectado. Reconecte e tente novamente." });
  }

  if (action === "auto_messages") {
    const { data: config } = await db
      .from("crm_auto_messages")
      .select("greeting_enabled, away_enabled, updated_at")
      .eq("organization_id", organizationId)
      .maybeSingle();
    return json({
      ok: true,
      action,
      connected: true,
      greeting_enabled: !!config?.greeting_enabled,
      away_enabled: !!config?.away_enabled,
      applied_at: config?.updated_at ?? new Date().toISOString(),
    });
  }

  const { data: replies, error: repliesError } = await db
    .from("quick_replies")
    .select("title, body, category")
    .eq("organization_id", organizationId)
    .order("title");
  if (repliesError) return json({ ok: false, message: repliesError.message }, 500);

  const { data: aiReplies } = await db
    .from("ai_quick_responses")
    .select("id, title")
    .eq("organization_id", organizationId);
  const existing = new Map(
    (aiReplies ?? []).map((item: any) => [String(item.title).trim().toLowerCase(), item.id]),
  );

  for (const reply of replies ?? []) {
    const key = reply.title.trim().toLowerCase();
    const row = {
      organization_id: organizationId,
      title: reply.title,
      content: reply.body,
      category: reply.category || "whatsapp",
      updated_at: new Date().toISOString(),
    };
    const id = existing.get(key);
    if (id) await db.from("ai_quick_responses").update(row).eq("id", id);
    else await db.from("ai_quick_responses").insert(row);
  }

  return json({
    ok: true,
    action,
    connected: true,
    synced: replies?.length ?? 0,
    channel: "whatsapp_crm",
    native_saved_replies_supported: false,
  });
});

