// Importação de contatos, conversas e etiquetas do WhatsApp (Evolution) para o CRM.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(b: unknown, status = 200) { return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } }); }

async function tf(url: string, opts: any, ms = 60000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ac.signal }); const txt = await r.text(); clearTimeout(t); let j: any = null; try { j = JSON.parse(txt); } catch {} return { status: r.status, json: j }; }
  catch (e) { clearTimeout(t); return { status: 0, error: String(e) }; }
}

/** Extrai o telefone real de um JID. Rejeita grupos, status e LIDs (id interno do WhatsApp). */
function jidPhone(jid: any): string | null {
  if (typeof jid !== "string") return null;
  if (jid.includes("@g.us") || jid.includes("broadcast") || jid.includes("@newsletter") || jid.includes("@lid")) return null;
  const num = jid.includes("@") ? jid.split("@")[0] : jid;
  if (!/^\d{8,15}$/.test(num)) return null;
  // Telefone real tem no máximo 15 dígitos, mas LID sem sufixo costuma ter 13+ e não começa com DDI válido.
  if (num.length > 13) return null;
  return num;
}
/** Escolhe o JID "de telefone" quando o objeto traz remoteJid e lid separados. */
function pickJid(o: any): string | null {
  const cands = [o?.remoteJid, o?.id, o?.jid, o?.owner, o?.remoteJidAlt, o?.phoneNumber];
  for (const c of cands) { if (typeof c === "string" && !c.includes("@lid") && jidPhone(c)) return c; }
  return null;
}
function cleanName(v: any): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\+?\d[\d\s().-]*$/.test(s)) return null; // nome que é só o número não serve
  return s;
}
function pickName(o: any): string | null {
  return cleanName(o?.name) || cleanName(o?.pushName) || cleanName(o?.notify)
      || cleanName(o?.verifiedName) || cleanName(o?.contact?.name) || cleanName(o?.subject) || null;
}
function tsToIso(ts: any): string | null {
  if (!ts) return null;
  if (typeof ts === "string" && ts.includes("-")) return ts;
  const n = Number(ts); if (!n) return null;
  return n > 1e12 ? new Date(n).toISOString() : new Date(n * 1000).toISOString();
}

/** Paleta usada pelo WhatsApp para etiquetas (índice -> hex). */
const LABEL_COLORS = ["#FF9485","#64C4FF","#FFD429","#DFAAF8","#8BE8A6","#FF8CD0","#8DE1E9","#FFB800","#C4A484","#9FA8DA",
                      "#F48FB1","#80CBC4","#BCAAA4","#CE93D8","#A5D6A7","#FFAB91","#B0BEC5","#FFCC80","#90CAF9","#E6EE9C"];
function labelColor(v: any): string | null {
  if (typeof v === "string" && v.startsWith("#")) return v;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return LABEL_COLORS[n % LABEL_COLORS.length];
  return null;
}
/** Ids de etiqueta presos ao chat, em qualquer um dos formatos que a Evolution devolve. */
function chatLabelIds(c: any): string[] {
  const raw = c?.labels ?? c?.labelIds ?? c?.Label ?? c?.label ?? null;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const l of arr) {
    if (l == null) continue;
    if (typeof l === "string" || typeof l === "number") out.push(String(l));
    else if (typeof l === "object") { const id = l.id ?? l.labelId ?? l.external_id; if (id != null) out.push(String(id)); }
  }
  return out;
}

async function fetchLabels(baseUrl: string, enc: string, H: any, diag: any) {
  const tries: { url: string; opts: any }[] = [
    { url: `${baseUrl}/label/findLabels/${enc}`, opts: { method: "GET", headers: H } },
    { url: `${baseUrl}/label/findLabels/${enc}`, opts: { method: "POST", headers: H, body: "{}" } },
    { url: `${baseUrl}/chat/findLabels/${enc}`, opts: { method: "GET", headers: H } },
  ];
  for (const t of tries) {
    const r = await tf(t.url, t.opts, 30000);
    const arr = Array.isArray(r.json) ? r.json : (Array.isArray(r.json?.data) ? r.json.data : (Array.isArray(r.json?.labels) ? r.json.labels : null));
    diag.labelTries.push({ url: t.url.replace(baseUrl, ""), method: t.opts.method, status: r.status, count: arr?.length ?? null });
    if (arr && arr.length) { diag.labelSample = arr.slice(0, 2); return arr; }
    if (arr) return arr; // endpoint respondeu, só não há etiqueta
  }
  return [];
}

/**
 * A Evolution v2.3 não expõe a associação etiqueta -> chat em nenhuma rota REST
 * (/label/findChats responde 404 em todas as variantes e o filtro `where.labels`
 * do /chat/findChats é ignorado, devolvendo a lista inteira). O vínculo chega
 * apenas pelos eventos `labels.association` do webhook, tratados na evolution-webhook.
 */

/**
 * Nome de contato não salvo na agenda: não existe.
 * Foi verificado rota a rota na Evolution v2.3.7 desta instância:
 *   - /chat/findContacts .... só conhece quem está salvo na agenda do celular;
 *   - /chat/findChats ....... não traz pushName para número comum;
 *   - /chat/findMessages .... traz pushName, mas para esses chats ele vem
 *                             literalmente igual ao número ("5516981402266");
 *   - /chat/fetchProfile e /chat/fetchBusinessProfile ... não têm campo `name`.
 * Varredura de 10 páginas x 1000 mensagens rendeu 0 nomes aproveitáveis, então
 * não vale gastar 62 requisições pesadas por sincronização. O nome chega de duas
 * formas legítimas: quando a pessoa escreve com um pushName real (webhook
 * `messages.upsert`) ou quando o usuário salva o contato no celular e sincroniza
 * de novo. Até lá a interface mostra o telefone formatado.
 */

export async function importAll(db: any, orgId: string, connectionId: string, baseUrl: string, enc: string, apiKey: string) {
  const H = { apikey: apiKey, "Content-Type": "application/json" };
  const out: any = { contacts: 0, conversas: 0, fetchedContacts: 0, fetchedChats: 0, labels: 0, labelLinks: 0 };
  const diag: any = {
    at: new Date().toISOString(), labelTries: [], assocTries: [], labelSample: null,
    chatSample: null, contactSample: null, nameSample: [],
    namedContacts: 0, namedChats: 0, skippedLid: 0,
  };

  // ---------------------------------------------------------------- contatos
  const rc = await tf(`${baseUrl}/chat/findContacts/${enc}`, { method: "POST", headers: H, body: "{}" }, 60000);
  const ca = Array.isArray(rc.json) ? rc.json : (Array.isArray(rc.json?.data) ? rc.json.data : []);
  out.fetchedContacts = ca.length;

  /** phone -> { name, jid, avatar } — só preenche o que ainda estiver vazio. */
  const people = new Map<string, { name: string | null; jid: string | null; avatar: string | null }>();
  const put = (phone: string, name: string | null, jid: string | null, avatar?: string | null) => {
    const cur = people.get(phone);
    if (!cur) { people.set(phone, { name, jid, avatar: avatar ?? null }); return; }
    if (!cur.name && name) cur.name = name;
    if (!cur.jid && jid) cur.jid = jid;
    if (!cur.avatar && avatar) cur.avatar = avatar;
  };
  if (ca.length) {
    diag.contactSample = ca.slice(0, 3).map((c: any) => ({
      keys: Object.keys(c ?? {}),
      name: c?.name ?? null, pushName: c?.pushName ?? null, notify: c?.notify ?? null, verifiedName: c?.verifiedName ?? null,
    }));
  }
  for (const c of ca) {
    const jid = pickJid(c); const p = jid ? jidPhone(jid) : null;
    if (!p) { diag.skippedLid++; continue; }
    const nm = pickName(c);
    if (nm) diag.namedContacts++;
    put(p, nm, jid, c?.profilePicUrl ?? null);
  }

  // ---------------------------------------------------------------- chats (nomes + etiquetas)
  const rh = await tf(`${baseUrl}/chat/findChats/${enc}`, { method: "POST", headers: H, body: "{}" }, 60000);
  const ha = Array.isArray(rh.json) ? rh.json : (Array.isArray(rh.json?.data) ? rh.json.data : []);
  out.fetchedChats = ha.length;
  if (ha.length) {
    diag.chatSample = ha.slice(0, 2).map((c: any) => ({ keys: Object.keys(c ?? {}), labels: c?.labels ?? c?.labelIds ?? null }));
    diag.nameSample = ha.slice(0, 8).map((c: any) => c?.pushName ?? c?.name ?? null);
  }

  const chats: any[] = [];
  const chatLabels: any[] = [];
  for (const c of ha) {
    const jid = pickJid(c); const p = jid ? jidPhone(jid) : null;
    if (!p) { diag.skippedLid++; continue; }
    const name = pickName(c);
    if (name) diag.namedChats++;
    put(p, name, jid, c?.profilePicUrl ?? null); // alimenta o import de contatos
    const lm = c?.lastMessage?.message || c?.lastMessage;
    const last_message = lm?.conversation || lm?.extendedTextMessage?.text || c?.lastMessage?.body || "";
    const last_at = tsToIso(c?.lastMessage?.messageTimestamp || c?.updatedAt || c?.lastMsgTimestamp) || "";
    chats.push({ phone: p, name, jid, last_message, last_at });
    const ids = chatLabelIds(c);
    if (ids.length) chatLabels.push({ phone: p, labels: ids });
  }

  diag.avatars = Array.from(people.values()).filter((v) => v.avatar).length;

  // ---------------------------------------------------------------- grava contatos
  // avatar vai SEMPRE null: o profilePicUrl da Evolution e uma URL assinada da
  // CDN do WhatsApp que expira em poucos dias, e guardar isso no banco fazia a
  // foto aparecer quebrada depois. Quem cuida das fotos e a funcao crm-avatars,
  // que baixa a imagem e guarda no bucket whatsapp-pics.
  const crows = Array.from(people.entries()).map(([phone, v]) => ({ phone, name: v.name, jid: v.jid, avatar: null }));
  for (let i = 0; i < crows.length; i += 500) {
    const { data } = await db.rpc("crm_import_contacts", { _org: orgId, _rows: crows.slice(i, i + 500) });
    out.contacts += (data as number) ?? 0;
  }
  for (let i = 0; i < chats.length; i += 300) {
    const { data } = await db.rpc("crm_import_chats", {
      _org: orgId,
      _connection: connectionId,
      _rows: chats.slice(i, i + 300),
    });
    out.conversas += (data as number) ?? 0;
  }

  // ---------------------------------------------------------------- etiquetas do WhatsApp
  try {
    const labs = await fetchLabels(baseUrl, enc, H, diag);
    const lrows = (labs ?? []).map((l: any) => ({
      external_id: String(l?.id ?? l?.labelId ?? l?.predefinedId ?? l?.name ?? ""),
      label: cleanName(l?.name) || cleanName(l?.label) || cleanName(l?.labelName) || null,
      color: labelColor(l?.color ?? l?.colorIndex ?? l?.hexColor),
    })).filter((l: any) => l.label);
    if (lrows.length) {
      const { data } = await db.rpc("crm_import_labels", { _org: orgId, _rows: lrows });
      out.labels = (data as number) ?? 0;
    }

    // Associação etiqueta -> chat: só existe se o findChats trouxer o campo embutido.
    // Nas versões atuais não traz — o vínculo chega pelos eventos `labels.association`.
    const assoc = chatLabels;
    // Junta por telefone — o RPC apaga as etiquetas que não vierem na linha.
    const byPhone = new Map<string, Set<string>>();
    for (const a of assoc) {
      const set = byPhone.get(a.phone) ?? new Set<string>();
      a.labels.forEach((l: string) => set.add(l));
      byPhone.set(a.phone, set);
    }
    const arows = Array.from(byPhone.entries()).map(([phone, set]) => ({ phone, labels: Array.from(set) }));
    for (let i = 0; i < arows.length; i += 300) {
      const { data } = await db.rpc("crm_apply_chat_labels", { _org: orgId, _rows: arows.slice(i, i + 300) });
      out.labelLinks += (data as number) ?? 0;
    }
    diag.chatsWithLabels = arows.length;
  } catch (e) { diag.labelError = String(e); }

  out.diag = diag;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const connectionId = (body.connectionId as string) || null;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: userRes } = await userClient.auth.getUser();
  const uid = userRes?.user?.id ?? null;
  if (!uid) return json({ error: "unauthorized" }, 401);
  const { data: prof } = await userClient.from("profiles").select("organization_id").eq("id", uid).maybeSingle();
  const orgId = (prof as any)?.organization_id ?? null;
  if (!orgId) return json({ error: "forbidden" }, 403);
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  let q = db.from("whatsapp_connections")
    .select("id, instance_name, base_url, api_key, is_default")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  if (connectionId) q = q.eq("id", connectionId);
  const { data: rows } = await q
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  const conn = rows?.[0] ?? null;
  if (!conn) return json({ error: "forbidden" }, 403);
  const baseUrl = (conn.base_url || EVOLUTION_BASE_URL || "").replace(/\/+$/, "");
  const instance = conn.instance_name || ""; const enc = encodeURIComponent(instance);
  const apiKey = (conn as any).api_key || EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey || !instance) return json({ ok: false, configured: false });
  try {
    const out = await importAll(db, orgId, conn.id, baseUrl, enc, apiKey);
    await db.from("whatsapp_connections")
      .update({ last_import_at: new Date().toISOString(), last_import_stats: out })
      .eq("id", conn.id);
    return json({ ok: true, ...out });
  } catch (e) { return json({ ok: false, error: String(e) }); }
});
