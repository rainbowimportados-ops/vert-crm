// Administração da conexão Evolution (status + conectar/QR + sync).
// Cada ação é resolvida pelo connectionId para impedir que uma conta use a
// instância, o QR Code ou a credencial de outra conexão da organização.
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

type JsonRecord = Record<string, any>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function mapState(state: string) {
  const normalized = state.toLowerCase();
  return normalized === "open" || normalized === "connected"
    ? "connected"
    : normalized === "connecting"
      ? "connecting"
      : "disconnected";
}

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function instanceName(value: JsonRecord) {
  return (
    value?.name ??
    value?.instanceName ??
    value?.instance?.instanceName ??
    value?.instance?.name ??
    null
  );
}

function instanceId(value: JsonRecord) {
  return (
    value?.id ??
    value?.instanceId ??
    value?.instance?.instanceId ??
    value?.instance?.id ??
    null
  );
}

function instanceToken(value: JsonRecord) {
  return (
    value?.token ??
    value?.apikey ??
    value?.hash?.apikey ??
    value?.instance?.token ??
    value?.instance?.apikey ??
    null
  );
}

function instanceNumber(value: JsonRecord) {
  const number =
    value?.number ??
    value?.ownerJid ??
    value?.instance?.number ??
    value?.instance?.ownerJid ??
    null;
  return typeof number === "string" ? number.split("@")[0] : null;
}

function instanceState(value: JsonRecord) {
  return (
    value?.connectionStatus ??
    value?.state ??
    value?.status ??
    value?.instance?.state ??
    value?.instance?.status ??
    "unknown"
  );
}

function findExactInstance(items: JsonRecord[], expectedName: string) {
  const expected = normalizeName(expectedName);
  return (
    items.find((item) => normalizeName(instanceName(item)) === expected) ?? null
  );
}

function errorMessage(payload: JsonRecord, fallback: string) {
  const candidate =
    payload?.message ?? payload?.error ?? payload?.response?.message;
  if (Array.isArray(candidate))
    return candidate.filter(Boolean).join(" · ") || fallback;
  if (typeof candidate === "string" && candidate.trim()) {
    if (/unauthori[sz]ed|não autorizado/i.test(candidate)) {
      return "A chave Evolution desta conexão não foi aceita. Salve a chave global ou a chave desta instância nas configurações do WhatsApp e tente novamente.";
    }
    return candidate;
  }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = (body.action as string) || "status";
  const connectionId = (body.connectionId as string) || null;

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const uid = userRes?.user?.id ?? null;
  if (!uid) return json({ error: "unauthorized" }, 401);

  const { data: prof } = await userClient
    .from("profiles")
    .select("organization_id")
    .eq("id", uid)
    .maybeSingle();
  const orgId = (prof as any)?.organization_id ?? null;
  if (!orgId) return json({ error: "forbidden" }, 403);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  let query = db
    .from("whatsapp_connections")
    .select("id, organization_id, instance_name, base_url, api_key, is_default")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  if (connectionId) query = query.eq("id", connectionId);

  const { data: rows, error } = await query
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  const connection = rows?.[0] ?? null;
  if (error || !connection) return json({ error: "forbidden" }, 403);

  // --- Onda 1: ações que dão controle do WhatsApp da clínica exigem gestão ---
  //
  // Antes desta checagem, QUALQUER usuário autenticado da organização podia
  // chamar action="connect", receber o QR Code no navegador e parear o
  // WhatsApp da clínica com o próprio celular. Uma recepcionista tinha o
  // mesmo poder que o dono. "status" e "sync" continuam liberados para todos,
  // porque são leitura e a tela de atendimento depende deles.
  const ACOES_DE_GESTAO = ["connect", "configure", "logout"];
  if (ACOES_DE_GESTAO.includes(action)) {
    const { data: papeisRows } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    const papeis = (papeisRows ?? []).map((r: JsonRecord) => r.role);
    const podeGerenciar = papeis.some((p: string) =>
      p === "admin" || p === "super_admin" || p === "gestor"
    );
    if (!podeGerenciar) {
      console.warn("crm-evolution: acao de gestao negada", {
        uid,
        orgId,
        action,
        papeis,
      });
      return json({
        ok: false,
        error:
          "Somente um administrador ou gestor pode conectar ou reconfigurar o WhatsApp da clínica.",
        reason: "insufficient_role",
      }, 403);
    }
  }

  if (action === "configure") {
    const newApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!newApiKey) return json({ ok: false, error: "Informe a chave Evolution desta conexão." }, 400);
    const { error: updateError } = await userClient
      .from("whatsapp_connections")
      .update({ api_key: newApiKey })
      .eq("id", connection.id)
      .eq("organization_id", orgId);
    if (updateError) return json({ ok: false, error: "Você não tem permissão para alterar a chave desta conexão." }, 403);
    return json({ ok: true, configured: true });
  }

  const baseUrl = (connection.base_url || EVOLUTION_BASE_URL || "").replace(
    /\/+$/,
    "",
  );
  const expectedInstance = (connection.instance_name || "").trim();
  const apiKey = (connection as any).api_key || EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey || !expectedInstance) {
    return json({
      ok: false,
      configured: false,
      error:
        "A conexão precisa de URL, chave e nome da instância antes de conectar.",
      reason: "missing_connection_configuration",
    });
  }

  const headers = { apikey: apiKey, "Content-Type": "application/json" };
  const encodedInstance = encodeURIComponent(expectedInstance);

  const persistInstance = async (value: JsonRecord, forcedStatus?: string) => {
    const patch: JsonRecord = {
      status: forcedStatus ?? mapState(String(instanceState(value))),
      last_status_at: new Date().toISOString(),
    };
    const name = instanceName(value);
    const id = instanceId(value);
    const token = instanceToken(value);
    const number = instanceNumber(value);
    if (name) patch.instance_name = name;
    if (id) patch.instance_id = id;
    if (token) patch.api_key = token;
    if (number) patch.phone_number = number;
    await db.from("whatsapp_connections").update(patch).eq("id", connection.id);
  };

  const fetchExact = async () => {
    const response = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers,
    });
    const text = await response.text();
    let items: JsonRecord[] = [];
    try {
      const parsed = JSON.parse(text);
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      // A resposta inválida será tratada como falha de consulta.
    }
    return {
      response,
      items,
      exact: findExactInstance(items, expectedInstance),
      preview: text.slice(0, 160),
    };
  };

  try {
    if (action === "sync") {
      const fetched = await fetchExact();
      if (!fetched.response.ok) {
        return json({
          ok: false,
          error: fetched.response.status === 401
            ? "A chave Evolution desta conexão não foi aceita. Atualize a chave nas configurações e tente novamente."
            : "Não foi possível consultar as instâncias no servidor Evolution.",
          reason: "fetch_failed",
          httpStatus: fetched.response.status,
        });
      }
      if (!fetched.exact) {
        return json({
          ok: false,
          error: `A instância ${expectedInstance} não foi encontrada. Gere um novo QR Code para criá-la.`,
          reason: "instance_not_found",
          instances: fetched.items.length,
        });
      }

      await persistInstance(fetched.exact);
      const syncedState = mapState(String(instanceState(fetched.exact)));
      console.log("crm-evolution sync", {
        connectionId: connection.id,
        instance: expectedInstance,
        status: syncedState,
      });
      return json({
        ok: true,
        synced: {
          name: instanceName(fetched.exact),
          status: syncedState,
          number: instanceNumber(fetched.exact),
          instances: fetched.items.length,
        },
      });
    }

    // Desliga o WhatsApp da instância sem apagar a conexão do CRM: o histórico
    // fica, e para voltar basta ler o QR de novo.
    if (action === "logout") {
      const response = await fetch(`${baseUrl}/instance/logout/${encodedInstance}`, {
        method: "DELETE",
        headers,
      });
      const output: JsonRecord = await response.json().catch(() => ({}));
      // 404 quer dizer que a instância já não estava pareada — o fim desejado.
      if (!response.ok && response.status !== 404) {
        return json({
          ok: false,
          error: errorMessage(output, "A Evolution não conseguiu desconectar esta instância."),
          httpStatus: response.status,
        });
      }
      await db
        .from("whatsapp_connections")
        .update({ status: "disconnected", last_status_at: new Date().toISOString() })
        .eq("id", connection.id);
      return json({ ok: true, status: "disconnected" });
    }

    if (action === "connect") {
      let response = await fetch(
        `${baseUrl}/instance/connect/${encodedInstance}`,
        { headers },
      );
      let output: JsonRecord = await response.json().catch(() => ({}));
      let created = false;

      if (!response.ok && response.status === 404) {
        response = await fetch(`${baseUrl}/instance/create`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            instanceName: expectedInstance,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
          }),
        });
        output = await response.json().catch(() => ({}));
        created = response.ok;
      }

      if (!response.ok) {
        const message = errorMessage(
          output,
          "A Evolution não conseguiu gerar o QR Code desta instância.",
        );
        console.error("crm-evolution connect failed", {
          connectionId: connection.id,
          instance: expectedInstance,
          httpStatus: response.status,
          message,
        });
        return json({
          ok: false,
          configured: true,
          error: message,
          httpStatus: response.status,
        });
      }

      const qr = output?.base64 ?? output?.qrcode?.base64 ?? null;
      const code =
        output?.pairingCode ??
        output?.code ??
        output?.qrcode?.pairingCode ??
        null;
      const rawState = String(instanceState(output));
      const status = qr ? "connecting" : mapState(rawState);
      await persistInstance(output, status);

      // Algumas versões da Evolution só devolvem token e instanceId em
      // fetchInstances. Fazemos o backfill, sempre exigindo o nome exato.
      if (!instanceToken(output) || !instanceId(output)) {
        const fetched = await fetchExact();
        if (fetched.response.ok && fetched.exact) {
          await persistInstance(fetched.exact, status);
        }
      }

      console.log("crm-evolution connect", {
        connectionId: connection.id,
        instance: expectedInstance,
        created,
        hasQr: !!qr,
        status,
      });
      return json({
        ok: true,
        configured: true,
        qr,
        code,
        status,
        state: rawState,
      });
    }

    const response = await fetch(
      `${baseUrl}/instance/connectionState/${encodedInstance}`,
      { headers },
    );
    const output: JsonRecord = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = errorMessage(
        output,
        `A instância ${expectedInstance} ainda não está disponível.`,
      );
      await db
        .from("whatsapp_connections")
        .update({
          status: "disconnected",
          last_status_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
      return json({
        ok: false,
        configured: true,
        status: "disconnected",
        error: message,
        httpStatus: response.status,
      });
    }

    const state = String(instanceState(output));
    const status = mapState(state);
    await persistInstance(output, status);
    return json({ ok: true, configured: true, status, state });
  } catch (caught) {
    console.error("crm-evolution unexpected", {
      connectionId: connection.id,
      action,
      error: String(caught),
    });
    return json({
      ok: false,
      configured: true,
      error: "Falha ao comunicar com o servidor do WhatsApp.",
    });
  }
});
