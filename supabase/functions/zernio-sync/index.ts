// Sincroniza o CRM com a caixa de entrada da Zernio (WhatsApp oficial e Instagram).
//
// O tempo real vem do zernio-webhook. Esta função cobre o resto:
//   modo "recente"   (pg_cron a cada 5 min): conversas mexidas nos últimos
//                    `minutos`; pega o que um webhook perdido deixou para trás.
//   modo "historico" (chamado à mão): traz as conversas dos últimos `dias`,
//                    em lotes; devolve `cursor` para continuar de onde parou.
//
// Tudo entra por crm_ingest_zernio, que ignora mensagem repetida (mesmo
// provider_message_id), então rodar de novo não duplica nada.
//
// Acesso: cabeçalho x-sync-token igual ao segredo zernio_sync_token do Vault.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZERNIO_API = "https://zernio.com/api/v1";
const ZERNIO_API_KEY = (Deno.env.get("ZERNIO_API_KEY") ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
const PRAZO_MS = 110_000; // para antes do limite da edge function e devolve o cursor
const MAX_MSGS_POR_CONVERSA = 100; // no histórico, as 100 mais recentes já dão o contexto
const PARALELO = 6;

type Json = Record<string, any>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function iguais(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function zernio(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(ZERNIO_API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${ZERNIO_API_KEY}` } });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    throw new Error(`Zernio ${resp.status} em ${path}: ${corpo.slice(0, 200)}`);
  }
  return (await resp.json()) as Json;
}

/** Tipo do anexo na Zernio -> tipo de mensagem no CRM (o mesmo do zernio-webhook). */
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

/** Nome só quando parece nome de gente (a Zernio repete o telefone no histórico). */
function nomeDePessoa(nome: unknown) {
  const n = typeof nome === "string" ? nome.trim() : "";
  return n && !/^\+?[\d\s()-]+$/.test(n) ? n : null;
}

async function gravarConversa(
  db: SupabaseClient,
  conn: Json,
  conv: Json,
  desde: number,
): Promise<{ novas: number; conversaId: string | null }> {
  // conversa já em dia no CRM (última mensagem igual à da Zernio): nada a buscar
  const { data: existente } = await db
    .from("conversations")
    .select("id, last_message_at")
    .eq("connection_id", conn.id)
    .eq("provider_conversation_id", conv.id)
    .limit(1)
    .maybeSingle();
  const ultimaZernio = new Date(conv.updatedTime ?? conv.updatedAt).getTime();
  if (existente?.last_message_at && new Date(existente.last_message_at).getTime() >= ultimaZernio - 1000) {
    return { novas: 0, conversaId: existente.id };
  }

  // mensagens da mais nova para a mais antiga, até passar de `desde`
  const msgs: Json[] = [];
  let cursor: string | undefined;
  do {
    const r = await zernio(`/inbox/conversations/${encodeURIComponent(conv.id)}/messages`, {
      accountId: conn.instance_id, limit: 100, sortOrder: "desc", cursor,
    });
    const pagina: Json[] = r.messages ?? r.data ?? [];
    let passou = false;
    for (const m of pagina) {
      if (new Date(m.createdAt ?? m.sentAt).getTime() < desde) { passou = true; break; }
      msgs.push(m);
    }
    cursor = passou ? undefined : r.pagination?.hasMore ? r.pagination?.nextCursor : undefined;
  } while (cursor && msgs.length < MAX_MSGS_POR_CONVERSA);

  const participante = conn.channel === "whatsapp"
    ? String(conv.participantId ?? "").replace(/^\+/, "")
    : String(conv.participantId ?? "");
  if (!participante || !msgs.length) return { novas: 0, conversaId: null };

  let novas = 0;
  // da mais antiga para a mais nova: a prévia da conversa fica com a última
  for (const m of msgs.reverse()) {
    const anexo: Json | undefined = Array.isArray(m.attachments) ? m.attachments[0] : undefined;
    let tipo = tipoDoAnexo(anexo);
    let texto: string = m.message ?? m.text ?? "";
    if (anexo?.type === "share" && anexo.url) {
      tipo = "text";
      texto = [texto, anexo.url].filter(Boolean).join("\n");
    }
    const entrada = m.direction !== "outgoing";
    const { data, error } = await db.rpc("crm_ingest_zernio", {
      _connection: conn.id,
      _participant_id: participante,
      _participant_username: conv.participantUsername ?? null,
      _participant_name: nomeDePessoa(conv.participantName) ?? (entrada ? nomeDePessoa(m.senderName) : null),
      _direction: entrada ? "in" : "out",
      _content: texto,
      _provider_msg_id: m.id ?? null,
      _msg_at: m.createdAt ?? m.sentAt ?? null,
      _type: tipo,
      _provider_conv_id: conv.id,
      _media_url: null,
    });
    if (error) throw new Error(`crm_ingest_zernio: ${error.message}`);
    if (data) novas += 1;
  }

  const { data: c } = await db
    .from("conversations")
    .select("id")
    .eq("connection_id", conn.id)
    .eq("provider_conversation_id", conv.id)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { novas, conversaId: (c as Json | null)?.id ?? null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: token } = await db.rpc("crm_zernio_sync_token");
  if (typeof token !== "string" || !iguais(req.headers.get("x-sync-token") ?? "", token)) {
    return json({ error: "nao autorizado" }, 401);
  }
  if (!ZERNIO_API_KEY.startsWith("sk_")) {
    return json({ error: "ZERNIO_API_KEY ausente ou sem o formato sk_ das chaves da Zernio" }, 503);
  }

  const body: Json = await req.json().catch(() => ({}));
  const historico = body.modo === "historico";
  const inicio = Date.now();
  const desde = historico
    ? inicio - Math.min(Math.max(Number(body.dias) || 30, 1), 365) * 86_400_000
    : inicio - Math.min(Math.max(Number(body.minutos) || 30, 5), 24 * 60) * 60_000;

  let query = db.from("whatsapp_connections").select("id, instance_id, channel").eq("provider", "zernio").eq("is_active", true);
  if (body.connectionId) query = query.eq("id", body.connectionId);
  const { data: conexoes, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const resultado: Json[] = [];
  for (const conn of conexoes ?? []) {
    if (!conn.instance_id) continue;
    let cursor: string | undefined = historico && body.connectionId === conn.id ? body.cursor : undefined;
    let conversas = 0;
    let mensagens = 0;
    let fim = false;
    let erro: string | null = null;
    const tocadas: string[] = [];
    try {
      while (!fim) {
        if (Date.now() - inicio > PRAZO_MS) break;
        const r = await zernio("/inbox/conversations", {
          accountId: conn.instance_id, limit: 50, sortOrder: "desc", cursor,
        });
        const lista: Json[] = r.data ?? [];
        // só as conversas mexidas depois de `desde` (a lista vem da mais nova)
        const alvo: Json[] = [];
        for (const conv of lista) {
          if (new Date(conv.updatedTime ?? conv.updatedAt).getTime() < desde) { fim = true; break; }
          alvo.push(conv);
        }
        // várias conversas ao mesmo tempo; as mensagens de cada uma seguem em ordem
        let processadas = 0;
        const fila = [...alvo];
        const trabalhar = async () => {
          for (let conv = fila.shift(); conv; conv = fila.shift()) {
            if (Date.now() - inicio > PRAZO_MS) { fila.length = 0; return; }
            const g = await gravarConversa(db, conn, conv, desde);
            conversas += 1;
            mensagens += g.novas;
            processadas += 1;
            if (g.conversaId && g.novas) tocadas.push(g.conversaId);
          }
        };
        await Promise.all(Array.from({ length: PARALELO }, trabalhar));
        if (processadas < alvo.length) { fim = false; break; } // estourou o prazo: devolve o cursor desta página
        if (fim) break;
        cursor = r.pagination?.hasMore ? r.pagination?.nextCursor : undefined;
        if (!cursor) fim = true;
      }
    } catch (e) {
      erro = String((e as Error)?.message ?? e);
      console.error("zernio-sync", { conexao: conn.id, erro });
    }

    // no histórico, "não lidas" = mensagens do paciente depois da última resposta da clínica
    if (historico && tocadas.length) {
      const { error: e2 } = await db.rpc("crm_recalcula_nao_lidas", { _conversas: tocadas });
      if (e2) console.error("zernio-sync nao lidas", e2.message);
    }
    resultado.push({
      conexao: conn.id, conversas, mensagens, erro,
      terminou: fim, cursor: fim ? null : cursor ?? null,
    });
  }
  return json({ ok: true, modo: historico ? "historico" : "recente", resultado });
});
