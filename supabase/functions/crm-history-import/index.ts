// Importa o historico de mensagens que a instancia da Evolution tem no banco dela.
//
// Por que existe: o importador antigo (importAll) busca CHATS e cria a conversa
// com a ultima mensagem de previa — nunca buscou mensagem. A COMERCIAL tinha 8
// mensagens no CRM e 15.144 disponiveis na Evolution.
//
// Grava pelo crm_backfill_message, nao pelo crm_ingest_message: o segundo e para
// mensagem ao vivo e somaria "nao lida" para cada uma das 15 mil, sobrescreveria
// a previa com mensagem antiga, reabriria conversa finalizada e emitiria um
// evento de dominio por mensagem.
//
// Trabalha em paginas e se reagenda ate zerar. Progresso em
// whatsapp_connections.history_import_state.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const TAMANHO_PAGINA = 200;
const PAGINAS_POR_CHAMADA = 4;
const SIMULTANEAS = 8;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Telefone real de um JID; rejeita grupo, canal e status. */
function telefoneDoJid(jid: any): string | null {
  if (typeof jid !== "string") return null;
  if (jid.includes("@g.us") || jid.includes("broadcast") || jid.includes("@newsletter") || jid.includes("@lid")) return null;
  const num = jid.includes("@") ? jid.split("@")[0] : jid;
  if (!/^\d{8,15}$/.test(num) || num.length > 13) return null;
  return num;
}

/** Um registro do findMessages vira o que o crm_backfill_message espera. */
function normaliza(reg: any) {
  const key = reg?.key ?? {};
  const bruto: string = key.remoteJid ?? "";
  if (bruto.endsWith("@g.us")) return null;   // grupo nao entra no CRM
  // Endereçado por LID: o telefone vem no campo alternativo.
  const jid = bruto.includes("@lid")
    ? (typeof key.remoteJidAlt === "string" ? key.remoteJidAlt
       : (typeof key.senderPn === "string" ? key.senderPn : ""))
    : bruto;
  const phone = telefoneDoJid(jid);
  if (!phone) return null;

  const msg = reg?.message ?? {};
  const content = msg.conversation ?? msg.extendedTextMessage?.text
    ?? msg.imageMessage?.caption ?? msg.videoMessage?.caption ?? "";
  const type = msg.imageMessage ? "image" : msg.audioMessage ? "audio"
    : msg.videoMessage ? "video" : msg.documentMessage ? "document" : "text";
  const fromMe = !!key.fromMe;
  const ts = Number(reg?.messageTimestamp ?? 0);

  return {
    phone,
    // pushName numa mensagem nossa e o nosso proprio perfil ("Você"), nao serve
    pushName: fromMe ? null : (typeof reg?.pushName === "string" ? reg.pushName : null),
    direction: fromMe ? "out" : "in",
    content,
    type,
    providerMessageId: key.id ?? null,
    messageAt: ts ? new Date(ts * 1000).toISOString() : null,
  };
}

async function emLotes<T>(itens: T[], tamanho: number, tarefa: (item: T) => Promise<void>) {
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.all(itens.slice(i, i + tamanho).map(tarefa));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const connectionId = typeof body.connectionId === "string" ? body.connectionId : null;
  const reiniciar = body.reiniciar === true;

  const interno = auth === `Bearer ${SERVICE_KEY}`;
  let orgId: string | null = null;

  if (interno) {
    orgId = typeof body.organizationId === "string" ? body.organizationId : null;
    if (!orgId) return json({ ok: false, error: "missing organizationId" }, 400);
  } else {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    const uid = userRes?.user?.id ?? null;
    if (!uid) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: perfil } = await userClient.from("profiles").select("organization_id").eq("id", uid).maybeSingle();
    orgId = (perfil as any)?.organization_id ?? null;
    if (!orgId) return json({ ok: false, error: "forbidden" }, 403);
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  let consulta = db.from("whatsapp_connections")
    .select("id, display_name, instance_name, base_url, api_key, status, history_import_state")
    .eq("organization_id", orgId).eq("is_active", true);
  if (connectionId) consulta = consulta.eq("id", connectionId);
  const { data: conexoes } = await consulta
    .order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1);
  const conexao = conexoes?.[0] ?? null;

  if (!conexao?.base_url || !conexao?.api_key || !conexao?.instance_name) {
    return json({ ok: false, error: "Conexão sem servidor, chave ou instância configurada." }, 400);
  }
  // Instancia fora do ar nao devolve mensagem nenhuma; parar aqui evita gravar
  // progresso falso e dar o import por concluido sem ter importado nada.
  if (conexao.status !== "connected") {
    return json({ ok: false, error: `${conexao.display_name ?? "Esta conexão"} está desconectada. Conecte o WhatsApp antes de importar o histórico.` }, 409);
  }

  const base = String(conexao.base_url).replace(/\/+$/, "");
  const instancia = encodeURIComponent(String(conexao.instance_name));
  const cabecalhos = { "Content-Type": "application/json", apikey: String(conexao.api_key) };

  const estado = (reiniciar ? null : conexao.history_import_state) as any;
  let pagina = Number(estado?.pagina) > 0 ? Number(estado.pagina) : 1;
  let gravadas = Number(estado?.gravadas) || 0;
  let paginas = Number(estado?.paginas) || 0;
  let total = Number(estado?.total) || 0;
  let ignoradas = Number(estado?.ignoradas) || 0;

  for (let volta = 0; volta < PAGINAS_POR_CHAMADA; volta += 1) {
    const resposta = await fetch(`${base}/chat/findMessages/${instancia}`, {
      method: "POST", headers: cabecalhos,
      body: JSON.stringify({ where: {}, page: pagina, offset: TAMANHO_PAGINA }),
    });
    if (!resposta.ok) {
      return json({ ok: false, error: `A Evolution recusou a página ${pagina}.`, httpStatus: resposta.status, pagina, gravadas }, 502);
    }
    const dados = await resposta.json().catch(() => ({}));
    const bloco = dados?.messages ?? dados;
    const registros: any[] = Array.isArray(bloco?.records) ? bloco.records : [];
    total = Number(bloco?.total) || total;
    // paginas vem em relacao ao offset pedido
    paginas = Number(bloco?.pages) || paginas;

    if (!registros.length) { pagina = 0; break; }   // fim

    await emLotes(registros, SIMULTANEAS, async (reg) => {
      const n = normaliza(reg);
      if (!n || !n.messageAt) { ignoradas += 1; return; }
      const { data, error } = await db.rpc("crm_backfill_message", {
        _org: orgId, _connection: conexao.id, _phone: n.phone, _push_name: n.pushName,
        _direction: n.direction, _content: n.content, _provider_msg_id: n.providerMessageId,
        _msg_at: n.messageAt, _type: n.type,
      });
      if (error) { ignoradas += 1; console.error("backfill", error.message); return; }
      if (data) gravadas += 1;   // null = mensagem ja existia
    });

    pagina += 1;
    if (paginas && pagina > paginas) { pagina = 0; break; }
  }

  const concluido = pagina === 0;
  await db.from("whatsapp_connections").update({
    history_import_state: {
      pagina, paginas, total, gravadas, ignoradas,
      concluido, atualizadoEm: new Date().toISOString(),
    },
  }).eq("id", conexao.id);

  // chamada interna termina o servico sozinha
  if (interno && !concluido) {
    const proxima = fetch(`${SUPABASE_URL}/functions/v1/crm-history-import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, connectionId: conexao.id }),
    }).catch(() => {});
    try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(proxima) : void proxima; } catch { /* ignore */ }
  }

  return json({ ok: true, gravadas, ignoradas, total, pagina, paginas, concluido });
});
