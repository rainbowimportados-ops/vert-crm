// Sincroniza as fotos de perfil dos contatos do WhatsApp.
//
// Por que existe: o crm-import guardava em crm_contacts.avatar_url o
// profilePicUrl cru da Evolution (https://pps.whatsapp.net/...&oe=<hex>). Essa
// URL e assinada pela CDN do WhatsApp e vale poucos dias — as 411 fotos
// importadas em 07/08 venceram em 06-07/08 e desde entao a tela so mostrava
// imagem quebrada.
//
// Aqui a imagem e BAIXADA e gravada no bucket privado whatsapp-pics em
// avatars/<organizacao>/<contato>.jpg. O banco passa a guardar a referencia
// interna "wa-pics:<caminho>", que nao expira. O front troca essa referencia
// por uma URL assinada de 1 hora na hora de desenhar a lista.
//
// Processa em lotes para caber no tempo da edge function: devolve quantos
// faltam para a tela chamar de novo ate zerar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "whatsapp-pics";
const PREFIXO = "wa-pics:";
const LOTE_PADRAO = 100;
const SIMULTANEAS = 6;
const REVALIDA_APOS_DIAS = 30;
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Numero no formato que a Evolution espera: JID quando houver, senao so digitos. */
function alvoDoContato(contato: { wa_jid: string | null; phone: string | null; phone_normalized: string | null }) {
  if (contato.wa_jid) return contato.wa_jid;
  const digitos = (contato.phone_normalized || contato.phone || "").replace(/\D+/g, "");
  return digitos ? `${digitos}@s.whatsapp.net` : null;
}

/** Caminho do arquivo na CDN, sem a assinatura que muda a cada consulta. */
function chaveDaFoto(url: string): string | null {
  try { return new URL(url).pathname || null; } catch { return null; }
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
  const limite = Math.min(Math.max(Number(body.limite) || LOTE_PADRAO, 1), 300);
  const refazerTudo = body.refazerTudo === true;

  // Duas portas de entrada: a tela (JWT do usuario) e o proprio sistema
  // (evolution-webhook chamando com a service role depois do pareamento).
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

  let consultaConexao = db
    .from("whatsapp_connections")
    .select("id, instance_name, base_url, api_key, status, display_name")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  if (connectionId) consultaConexao = consultaConexao.eq("id", connectionId);
  const { data: conexoes } = await consultaConexao
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  const conexao = conexoes?.[0] ?? null;
  if (!conexao?.base_url || !conexao?.api_key || !conexao?.instance_name) {
    return json({ ok: false, error: "Conexão sem servidor, chave ou instância configurada." }, 400);
  }
  // Com o WhatsApp fora do ar toda consulta de foto falha. Sem esta parada, a
  // rodada marcaria centenas de contatos como "ja tentei" e eles ficariam 30
  // dias sem foto mesmo depois de reconectar.
  if (conexao.status !== "connected") {
    return json({ ok: false, error: `${conexao.display_name ?? "Esta conexão"} está desconectada. Conecte o WhatsApp antes de atualizar as fotos.` }, 409);
  }

  // contatos que conversam por esta conexao
  const { data: conversas } = await db
    .from("conversations")
    .select("contact_id")
    .eq("organization_id", orgId)
    .eq("connection_id", conexao.id)
    .limit(5000);
  const idsDoPainel = [...new Set((conversas ?? []).map((linha: any) => linha.contact_id).filter(Boolean))];
  if (!idsDoPainel.length) return json({ ok: true, processados: 0, comFoto: 0, semFoto: 0, restantes: 0 });

  const limiteRevalidacao = new Date(Date.now() - REVALIDA_APOS_DIAS * 86400_000).toISOString();
  const selecionaPendentes = () => {
    let q = db
      .from("crm_contacts")
      .select("id, phone, phone_normalized, wa_jid, avatar_url, avatar_source_key", { count: "exact" })
      .eq("organization_id", orgId)
      .in("id", idsDoPainel)
      .is("deleted_at", null);
    if (!refazerTudo) q = q.or(`avatar_synced_at.is.null,avatar_synced_at.lt.${limiteRevalidacao}`);
    return q;
  };

  const { data: pendentes, count: totalPendente } = await selecionaPendentes()
    .order("updated_at", { ascending: false })
    .limit(limite);

  const base = String(conexao.base_url).replace(/\/+$/, "");
  const instancia = encodeURIComponent(String(conexao.instance_name));
  const cabecalhos = { "Content-Type": "application/json", apikey: String(conexao.api_key) };

  let comFoto = 0;
  let semFoto = 0;
  let erros = 0;

  await emLotes(pendentes ?? [], SIMULTANEAS, async (contato: any) => {
    const agora = new Date().toISOString();
    const alvo = alvoDoContato(contato);
    if (!alvo) { semFoto += 1; await db.from("crm_contacts").update({ avatar_synced_at: agora }).eq("id", contato.id); return; }

    try {
      const resposta = await fetch(`${base}/chat/fetchProfilePictureUrl/${instancia}`, {
        method: "POST", headers: cabecalhos, body: JSON.stringify({ number: alvo }),
      });
      const dados = await resposta.json().catch(() => ({}));
      const urlDaFoto: string | null = dados?.profilePictureUrl ?? dados?.profilePicUrl ?? null;

      if (!resposta.ok || !urlDaFoto) {
        semFoto += 1;
        // sem foto publica: limpa o que houver e marca a tentativa
        await db.from("crm_contacts").update({ avatar_url: null, avatar_source_key: null, avatar_synced_at: agora }).eq("id", contato.id);
        return;
      }

      // mesma foto de antes e o arquivo ja esta no bucket: nao baixa de novo
      const chave = chaveDaFoto(urlDaFoto);
      if (chave && chave === contato.avatar_source_key && contato.avatar_url) {
        comFoto += 1;
        await db.from("crm_contacts").update({ avatar_synced_at: agora }).eq("id", contato.id);
        return;
      }

      const imagem = await fetch(urlDaFoto);
      const bytes = new Uint8Array(await imagem.arrayBuffer());
      if (!imagem.ok || !bytes.length || bytes.length > TAMANHO_MAXIMO) {
        semFoto += 1;
        await db.from("crm_contacts").update({ avatar_synced_at: agora }).eq("id", contato.id);
        return;
      }

      const tipo = imagem.headers.get("content-type") || "image/jpeg";
      const caminho = `avatars/${orgId}/${contato.id}.jpg`;
      const { error: erroUpload } = await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: true });
      if (erroUpload) { erros += 1; return; }

      comFoto += 1;
      await db.from("crm_contacts")
        .update({ avatar_url: `${PREFIXO}${caminho}`, avatar_source_key: chave, avatar_synced_at: agora })
        .eq("id", contato.id);
    } catch (_erro) {
      // falha de rede nao e resposta: nao marca como tentado, para reprocessar depois
      erros += 1;
    }
  });

  const processados = (pendentes ?? []).length;
  // so conta como andamento quem recebeu resposta; os erros voltam na proxima rodada
  const restantes = Math.max((totalPendente ?? processados) - (comFoto + semFoto), 0);

  // Chamada interna termina o servico sozinha: emenda a proxima rodada em
  // segundo plano ate a fila zerar, para o pareamento nao depender de ninguem
  // clicando em nada. Progresso (comFoto + semFoto) evita laco infinito.
  if (interno && restantes > 0 && comFoto + semFoto > 0) {
    const proxima = fetch(`${SUPABASE_URL}/functions/v1/crm-avatars`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, connectionId: conexao.id, limite }),
    }).catch(() => {});
    try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(proxima) : void proxima; } catch { /* ignore */ }
  }

  return json({ ok: true, processados, comFoto, semFoto, erros, restantes });
});
