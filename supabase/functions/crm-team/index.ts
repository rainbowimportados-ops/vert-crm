// Equipe do CRM: cria logins e gerencia modulos e paineis de WhatsApp por pessoa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(String).filter(Boolean)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: roleRows } = await authClient.from("user_roles").select("role").eq("user_id", user.id);
  const isManager = Array.isArray(roleRows) && roleRows.some((row: any) => ["admin", "super_admin", "gestor"].includes(row.role));
  if (!isManager) return json({ error: "forbidden" }, 403);

  const { data: profile } = await admin.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
  const organizationId = (profile as any)?.organization_id;
  if (!organizationId) return json({ error: "no_org" }, 400);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");

  const validConnections = async (requested: unknown) => {
    const ids = uniqueIds(requested);
    if (!ids.length) return [];
    const { data, error } = await admin
      .from("whatsapp_connections")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("id", ids);
    if (error) throw error;
    if ((data ?? []).length !== ids.length) throw new Error("Um dos paineis de WhatsApp nao pertence a esta clinica.");
    return ids;
  };

  if (action === "list") {
    const { data: members, error: membersError } = await admin
      .from("crm_members")
      .select("user_id, permissions, active, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });
    if (membersError) return json({ error: membersError.message }, 400);
    const ids = (members ?? []).map((member: any) => member.user_id);
    const [{ data: profiles }, { data: roles }, { data: accesses }] = await Promise.all([
      ids.length ? admin.from("profiles").select("id, full_name, email").in("id", ids) : Promise.resolve({ data: [] } as any),
      ids.length ? admin.from("user_roles").select("user_id, role").in("user_id", ids) : Promise.resolve({ data: [] } as any),
      ids.length ? admin.from("crm_connection_members").select("user_id, connection_id, active").eq("organization_id", organizationId).in("user_id", ids) : Promise.resolve({ data: [] } as any),
    ]);
    const profileMap: Record<string, any> = {};
    const roleMap: Record<string, string> = {};
    const accessMap: Record<string, string[]> = {};
    (profiles ?? []).forEach((row: any) => { profileMap[row.id] = row; });
    (roles ?? []).forEach((row: any) => { roleMap[row.user_id] = row.role; });
    (accesses ?? []).forEach((row: any) => {
      if (!row.active) return;
      (accessMap[row.user_id] ??= []).push(row.connection_id);
    });
    return json({
      ok: true,
      members: (members ?? []).map((member: any) => ({
        userId: member.user_id,
        name: profileMap[member.user_id]?.full_name ?? "",
        email: profileMap[member.user_id]?.email ?? "",
        role: roleMap[member.user_id] ?? "atendente",
        permissions: member.permissions ?? [],
        connectionIds: accessMap[member.user_id] ?? [],
        active: member.active,
      })),
    });
  }

  if (action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim();
    const permissions: string[] = Array.isArray(body.permissions) ? body.permissions.map(String) : [];
    if (!email || !password || !fullName) return json({ error: "Campos obrigatorios faltando" }, 400);
    if (password.length < 6) return json({ error: "Senha deve ter ao menos 6 caracteres" }, 400);

    let connectionIds: string[];
    try { connectionIds = await validConnections(body.connectionIds); }
    catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 400); }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError) return json({ error: createError.message }, 400);
    const newUserId = created.user?.id;
    if (!newUserId) return json({ error: "Usuario nao criado" }, 500);

    await admin.from("profiles").upsert({ id: newUserId, full_name: fullName, email, organization_id: organizationId }, { onConflict: "id" });
    await admin.from("user_roles").delete().eq("user_id", newUserId);
    await admin.from("user_roles").insert({ user_id: newUserId, role: "atendente" });
    await admin.from("crm_members").upsert({ organization_id: organizationId, user_id: newUserId, permissions, active: true }, { onConflict: "organization_id,user_id" });
    if (connectionIds.length) {
      await admin.from("crm_connection_members").insert(connectionIds.map((connectionId) => ({
        organization_id: organizationId,
        connection_id: connectionId,
        user_id: newUserId,
        access_level: "agent",
        active: true,
        created_by: user.id,
      })));
    }
    return json({ ok: true, userId: newUserId });
  }

  if (action === "update") {
    const userId = String(body.userId || "");
    if (!userId) return json({ error: "userId faltando" }, 400);
    const { data: target } = await admin.from("crm_members").select("user_id").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
    if (!target) return json({ error: "Usuario nao pertence a esta clinica" }, 404);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (Array.isArray(body.permissions)) patch.permissions = body.permissions.map(String);
    if (typeof body.active === "boolean") patch.active = body.active;
    const { error } = await admin.from("crm_members").update(patch).eq("organization_id", organizationId).eq("user_id", userId);
    if (error) return json({ error: error.message }, 400);

    if (Array.isArray(body.connectionIds)) {
      let connectionIds: string[];
      try { connectionIds = await validConnections(body.connectionIds); }
      catch (validationError) { return json({ error: validationError instanceof Error ? validationError.message : String(validationError) }, 400); }
      await admin.from("crm_connection_members").delete().eq("organization_id", organizationId).eq("user_id", userId);
      if (connectionIds.length) {
        const { error: accessError } = await admin.from("crm_connection_members").insert(connectionIds.map((connectionId) => ({
          organization_id: organizationId,
          connection_id: connectionId,
          user_id: userId,
          access_level: "agent",
          active: true,
          created_by: user.id,
        })));
        if (accessError) return json({ error: accessError.message }, 400);
      }
    }
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
