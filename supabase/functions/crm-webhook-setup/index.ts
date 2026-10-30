// Registra na Evolution para onde ela deve mandar os eventos desta conexão.
//
// Por que existe: a `crm-evolution` cria a instância e gera o QR, mas nunca diz
// à Evolution qual é o endereço do webhook. Quem configurou isso até hoje foi
// uma pessoa, pelo painel da Evolution. Consequência: instância criada pela tela
// do sistema nunca recebe mensagem, e ninguém descobre — a conexão aparece como
// "connected" e o inbox simplesmente fica mudo.
//
// O endereço registrado leva connectionId e secret na query string, porque é
// assim que a `evolution-webhook` identifica e autentica a conexão. Registrar o
// endereço de OUTRA conexão faz a mensagem entrar no lugar errado — exatamente o
// risco quando duas conexões dividem o mesmo instance_name.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

// Só os eventos que a evolution-webhook realmente trata. Assinar o resto apenas
// enche a webhook_inbox de linha que a função responde com handled:false.
const EVENTOS = [
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
  "LABELS_EDIT",
  "LABELS_ASSOCIATION",
];

function segredoNovo() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A URL sem o segredo, para poder aparecer na tela e no log sem vazar. */
function urlSegura(url: string) {
  return url.replace(/secret=[^&]+/, "secret=***");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const connectionId = (body.connectionId as string) || null;
  if (!connectionId) return json({ ok: false, error: "Informe a conexão." }, 400);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const uid = userRes?.user?.id ?? null;
  if (!uid) return json({ ok: false, error: "unauthorized" }, 401);

  const { data: prof } = await userClient
    .from("profiles").select("organization_id").eq("id", uid).maybeSingle();
  const orgId = (prof as any)?.organization_id ?? null;
  if (!orgId) return json({ ok: false, error: "forbidden" }, 403);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // Mesma régua da crm-evolution: apontar o webhook é ato de gestão. Quem
  // consegue redirecionar o webhook consegue desviar a conversa da clínica.
  const { data: papeisRows } = await db.from("user_roles").select("role").eq("user_id", uid);
  const papeis = (papeisRows ?? []).map((r: any) => r.role);
  if (!papeis.some((p: string) => p === "admin" || p === "super_admin" || p === "gestor")) {
    return json({
      ok: false,
      error: "Somente um administrador ou gestor pode configurar o webhook do WhatsApp.",
      reason: "insufficient_role",
    }, 403);
  }

  const { data: conn } = await db
    .from("whatsapp_connections")
    .select("id, organization_id, instance_name, base_url, api_key, webhook_secret, display_name")
    .eq("id", connectionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!conn) return json({ ok: false, error: "forbidden" }, 403);

  const baseUrl = String(conn.base_url || "").replace(/\/+$/, "");
  const instancia = String(conn.instance_name || "").trim();
  const apiKey = String(conn.api_key || "");
  if (!baseUrl || !instancia || !apiKey) {
    return json({
      ok: false,
      error: "A conexão precisa de URL, nome da instância e chave antes de configurar o webhook.",
      reason: "missing_connection_configuration",
    });
  }

  // Sem segredo o webhook devolve 401 em todo evento. Se faltar, cria agora.
  let secret = String(conn.webhook_secret || "");
  if (!secret) {
    secret = segredoNovo();
    await db.from("whatsapp_connections").update({ webhook_secret: secret }).eq("id", conn.id);
  }

  const url = `${SUPABASE_URL}/functions/v1/evolution-webhook?connectionId=${conn.id}&secret=${secret}`;
  const headers = { apikey: apiKey, "Content-Type": "application/json" };
  const endpoint = `${baseUrl}/webhook/set/${encodeURIComponent(instancia)}`;

  // A Evolution mudou o formato do corpo entre a v1 e a v2 e não há como saber
  // a versão do servidor por aqui. Tenta o formato novo e, se recusar, o antigo.
  const tentativas: { formato: string; corpo: unknown }[] = [
    {
      formato: "v2",
      corpo: {
        webhook: {
          enabled: true,
          url,
          byEvents: false,
          base64: true,
          events: EVENTOS,
        },
      },
    },
    {
      formato: "v1",
      corpo: {
        url,
        enabled: true,
        webhook_by_events: false,
        webhook_base64: true,
        events: EVENTOS,
      },
    },
  ];

  const tentado: { formato: string; httpStatus: number; resposta: string }[] = [];
  for (const t of tentativas) {
    try {
      const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(t.corpo) });
      const texto = (await r.text()).slice(0, 200);
      tentado.push({ formato: t.formato, httpStatus: r.status, resposta: texto });
      if (r.ok) {
        console.log("crm-webhook-setup ok", {
          connectionId: conn.id,
          instancia,
          formato: t.formato,
          url: urlSegura(url),
        });
        return json({
          ok: true,
          formato: t.formato,
          instancia,
          eventos: EVENTOS,
          url: urlSegura(url),
        });
      }
    } catch (e) {
      tentado.push({ formato: t.formato, httpStatus: 0, resposta: String(e).slice(0, 200) });
    }
  }

  console.error("crm-webhook-setup falhou", { connectionId: conn.id, instancia, tentado });
  return json({
    ok: false,
    error: "A Evolution não aceitou o registro do webhook. Confira a URL e a chave desta conexão.",
    instancia,
    tentado,
  });
});
