// Disparo de campanha: valida permissão, monta o público (respeitando opt-out e filtros),
// deduplica e ENFILEIRA as mensagens (pending) pela fila do CRM. Envio real via Evolution (Fase transporte).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BATCH = 500;

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

  const { campaignId } = await req.json().catch(() => ({}));
  if (!campaignId) return json({ error: "missing campaignId" }, 400);

  // Permissão via RLS
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: camp, error } = await userClient
    .from("campaigns").select("id, organization_id, message_template, filters, status").eq("id", campaignId).maybeSingle();
  if (error || !camp) return json({ error: "forbidden" }, 403);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const org = camp.organization_id;
  const filters = (camp.filters ?? {}) as any;
  let connectionQuery = db.from("whatsapp_connections")
    .select("id, installation_id, is_default")
    .eq("organization_id", org)
    .eq("is_active", true);
  if (filters.connectionId) connectionQuery = connectionQuery.eq("id", filters.connectionId);
  const { data: connectionRows } = await connectionQuery
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  const connection = connectionRows?.[0] ?? null;
  if (!connection) return json({ error: "WhatsApp de saída não encontrado" }, 400);

  // Público: contatos da org, sem opt-out, opcionalmente por tag
  let contactIds: string[] | null = null;
  if (filters.tagId) {
    const { data: ct } = await db.from("contact_tags").select("contact_id").eq("organization_id", org).eq("tag_id", filters.tagId);
    contactIds = (ct ?? []).map((r: any) => r.contact_id);
    if (contactIds.length === 0) { await db.from("campaigns").update({ status: "concluida" }).eq("id", campaignId); return json({ ok: true, queued: 0, reason: "sem público" }); }
  }
  let q = db.from("crm_contacts").select("id, name, phone").eq("organization_id", org).eq("opt_out", false).limit(BATCH);
  if (contactIds) q = q.in("id", contactIds);
  const { data: contacts } = await q;

  await db.from("campaigns").update({ status: "enviando" }).eq("id", campaignId);

  const nowIso = new Date().toISOString();
  let queued = 0, skipped = 0;
  for (const c of (contacts ?? [])) {
    // dedupe por (campaign, contact)
    const { data: rec, error: recErr } = await db.from("campaign_recipients")
      .insert({ organization_id: org, campaign_id: campaignId, contact_id: c.id, status: "queued" })
      .select("id").single();
    if (recErr) { skipped++; continue; } // já existe (unique)

    // conversa aberta ou cria
    let convId: string | null = null;
    const { data: conv } = await db.from("conversations")
      .select("id").eq("organization_id", org).eq("contact_id", c.id).eq("connection_id", connection.id).neq("status", "finalizado")
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (conv) convId = conv.id;
    else {
      const { data: nc } = await db.from("conversations")
        .insert({
          organization_id: org,
          installation_id: connection.installation_id,
          connection_id: connection.id,
          contact_id: c.id,
          status: "novo",
        }).select("id").single();
      convId = nc?.id ?? null;
    }
    if (!convId) { skipped++; continue; }

    const text = String(camp.message_template).replace(/\{nome\}/gi, (c.name || "").split(" ")[0] || "");
    const { data: msg } = await db.from("messages").insert({
      organization_id: org, conversation_id: convId, direction: "out", type: "text",
      content: text, delivery_status: "pending", message_at: nowIso,
    }).select("id").single();
    await db.from("conversations").update({ last_message_preview: text.slice(0, 120), last_message_at: nowIso }).eq("id", convId);
    await db.from("campaign_recipients").update({ conversation_id: convId, message_id: msg?.id ?? null }).eq("id", rec.id);
    queued++;
  }

  await db.from("campaigns").update({ status: "concluida" }).eq("id", campaignId);
  return json({ ok: true, queued, skipped });
});
