// Webhook de ENTRADA da Evolution API (+ auto-import ao conectar + auto-heal do túnel).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }

/** Extrai o telefone real de um JID. Rejeita grupos, status e LIDs (id interno do WhatsApp). */
function jidPhone(jid: any): string | null {
  if (typeof jid !== "string") return null;
  if (jid.includes("@g.us") || jid.includes("broadcast") || jid.includes("@newsletter") || jid.includes("@lid")) return null;
  const num = jid.includes("@") ? jid.split("@")[0] : jid;
  if (!/^\d{8,15}$/.test(num)) return null;
  if (num.length > 13) return null;
  return num;
}
function pickJid(o: any): string | null {
  // O telefone real pode vir um nivel abaixo: quando o chat e enderecado por LID,
  // a Evolution poe o numero em lastMessage.key.remoteJidAlt (ou participantAlt,
  // em grupo). Procurar so no topo do objeto descartava esses chats.
  const cands = [
    o?.remoteJid, o?.id, o?.jid, o?.owner, o?.remoteJidAlt, o?.phoneNumber,
    o?.lastMessage?.key?.remoteJidAlt, o?.lastMessage?.key?.participantAlt,
  ];
  for (const c of cands) { if (typeof c === "string" && !c.includes("@lid") && jidPhone(c)) return c; }
  return null;
}
function cleanName(v: any): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\+?\d[\d\s().-]*$/.test(s)) return null;
  return s;
}
function pickName(o: any): string | null {
  return cleanName(o?.name) || cleanName(o?.pushName) || cleanName(o?.notify)
      || cleanName(o?.verifiedName) || cleanName(o?.contact?.name) || cleanName(o?.subject) || null;
}
const LABEL_COLORS = ["#FF9485","#64C4FF","#FFD429","#DFAAF8","#8BE8A6","#FF8CD0","#8DE1E9","#FFB800","#C4A484","#9FA8DA",
                      "#F48FB1","#80CBC4","#BCAAA4","#CE93D8","#A5D6A7","#FFAB91","#B0BEC5","#FFCC80","#90CAF9","#E6EE9C"];
function labelColor(v: any): string | null {
  if (typeof v === "string" && v.startsWith("#")) return v;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return LABEL_COLORS[n % LABEL_COLORS.length];
  return null;
}
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
function tsToIso(ts: any): string | null {
  if (!ts) return null;
  if (typeof ts === "string" && ts.includes("-")) return ts;
  const n = Number(ts); if (!n) return null;
  return n > 1e12 ? new Date(n).toISOString() : new Date(n * 1000).toISOString();
}
async function tf(url: string, opts: any, ms = 60000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ac.signal }); const txt = await r.text(); clearTimeout(t); let j: any = null; try { j = JSON.parse(txt); } catch {} return { status: r.status, json: j }; }
  catch (_e) { clearTimeout(t); return { status: 0 }; }
}
function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "arquivo";
}
function extensionFor(mime: string) {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
    "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
  };
  return map[mime] || "bin";
}
function decodeBase64(value: string) {
  const clean = value.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(clean); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
async function persistIncomingMedia(db: any, conn: any, messageId: string, conversationId: string, normalized: any) {
  if (normalized.type === "text" || !conn.base_url || !conn.api_key || !conn.instance_name) return;
  try {
    const response = await fetch(`${String(conn.base_url).replace(/\/+$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(conn.instance_name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: conn.api_key },
      body: JSON.stringify({ message: normalized.rawMessage, convertToMp4: false }),
    });
    const data = await response.json().catch(() => ({}));
    const base64 = data?.base64 || data?.data?.base64;
    if (!response.ok || typeof base64 !== "string" || base64.length > 24_000_000) return;
    const mimeType = data?.mimetype || data?.mimeType || normalized.mimeType || "application/octet-stream";
    const name = safeFileName(normalized.fileName || `${normalized.type}-${normalized.providerMessageId}.${extensionFor(mimeType)}`);
    const storagePath = `${conn.organization_id}/${conversationId}/${messageId}/${name}`;
    const { error } = await db.storage.from("crm-media").upload(storagePath, decodeBase64(base64), { contentType: mimeType, upsert: true });
    if (!error) await db.from("messages").update({ media_url: `crm-media:${storagePath}` }).eq("id", messageId);
  } catch (error) {
    console.error("evolution-webhook media", { messageId, error: String(error) });
  }
}
// ------------------------------------------------------------------ fotos de perfil
//
// A foto do contato NUNCA e guardada como URL da CDN do WhatsApp: aquele
// endereco vem assinado e vence em poucos dias, e foi exatamente isso que
// deixou as 411 fotos importadas em 07/08 quebradas na tela. Aqui a imagem e
// baixada e gravada no bucket privado whatsapp-pics; o banco guarda so
// "wa-pics:<caminho>".
//
// Como o evento contacts.update chega com frequencia, avatar_source_key guarda
// o caminho do arquivo na CDN (a parte que NAO muda enquanto a pessoa nao troca
// a foto). Chave igual = nada a baixar.
const BUCKET_FOTOS = "whatsapp-pics";
const PREFIXO_FOTO = "wa-pics:";
const REVALIDA_FOTO_DIAS = 7;
const TAMANHO_MAXIMO_FOTO = 2 * 1024 * 1024;

/** Caminho do arquivo na CDN, sem a assinatura que muda a cada consulta. */
function chaveDaFoto(url: string): string | null {
  try { return new URL(url).pathname || null; } catch { return null; }
}

/**
 * Mantem a foto de um contato em dia.
 * - urlRecebida: quando o proprio evento da Evolution ja trouxe o profilePicUrl.
 * - sem urlRecebida: consulta a Evolution, mas so se a ultima checagem for antiga.
 */
async function sincronizaFotoDoContato(db: any, conn: any, phone: string, urlRecebida?: string | null) {
  try {
    const { data: contato } = await db
      .from("crm_contacts")
      .select("id, avatar_url, avatar_source_key, avatar_synced_at")
      .eq("organization_id", conn.organization_id)
      .eq("phone_normalized", phone)
      .is("deleted_at", null)
      .maybeSingle();
    if (!contato) return;

    const checadoEm = contato.avatar_synced_at ? new Date(contato.avatar_synced_at).getTime() : 0;
    const recente = Date.now() - checadoEm < REVALIDA_FOTO_DIAS * 86400_000;

    let url = typeof urlRecebida === "string" && urlRecebida ? urlRecebida : null;
    if (!url) {
      // sem foto no evento: so vale consultar a Evolution se faz tempo que ninguem olhou
      if (recente || !conn.base_url || !conn.api_key || !conn.instance_name) return;
      const consulta = await fetch(
        `${String(conn.base_url).replace(/\/+$/, "")}/chat/fetchProfilePictureUrl/${encodeURIComponent(conn.instance_name)}`,
        { method: "POST", headers: { "Content-Type": "application/json", apikey: conn.api_key }, body: JSON.stringify({ number: `${phone}@s.whatsapp.net` }) },
      );
      const dados = await consulta.json().catch(() => ({}));
      url = dados?.profilePictureUrl ?? dados?.profilePicUrl ?? null;
      if (!consulta.ok || !url) {
        // contato sem foto publica: registra a tentativa e limpa o que houver
        await db.from("crm_contacts")
          .update({ avatar_url: null, avatar_source_key: null, avatar_synced_at: new Date().toISOString() })
          .eq("id", contato.id);
        return;
      }
    }

    const chave = chaveDaFoto(url);
    // mesma foto de antes e o arquivo ja esta no bucket: so renova o carimbo
    if (chave && chave === contato.avatar_source_key && contato.avatar_url) {
      await db.from("crm_contacts").update({ avatar_synced_at: new Date().toISOString() }).eq("id", contato.id);
      return;
    }

    const imagem = await fetch(url);
    const bytes = new Uint8Array(await imagem.arrayBuffer());
    if (!imagem.ok || !bytes.length || bytes.length > TAMANHO_MAXIMO_FOTO) return;

    const caminho = `avatars/${conn.organization_id}/${contato.id}.jpg`;
    const { error } = await db.storage.from(BUCKET_FOTOS).upload(caminho, bytes, {
      contentType: imagem.headers.get("content-type") || "image/jpeg",
      upsert: true,
    });
    if (error) return;

    await db.from("crm_contacts")
      .update({ avatar_url: `${PREFIXO_FOTO}${caminho}`, avatar_source_key: chave, avatar_synced_at: new Date().toISOString() })
      .eq("id", contato.id);
  } catch (erro) {
    console.error("evolution-webhook foto", { phone, erro: String(erro) });
  }
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
    if (arr) return arr;
  }
  return [];
}

async function importAll(db: any, orgId: string, baseUrl: string, instance: string, apiKey: string, connId?: string) {
  const enc = encodeURIComponent(instance);
  const H = { apikey: apiKey, "Content-Type": "application/json" };
  const out: any = { contacts: 0, conversas: 0, fetchedContacts: 0, fetchedChats: 0, labels: 0, labelLinks: 0, source: "webhook" };
  const diag: any = { at: new Date().toISOString(), labelTries: [], labelSample: null, skippedLid: 0, skippedGroups: 0, rpcErrors: [] };
  // Um unico contador "skippedLid" somava grupos, canais e LIDs, e por isso
  // acusava 952 descartes onde 58 eram grupos legitimos.
  const conta = (o: any) => {
    const jid = String(o?.remoteJid ?? o?.id ?? "");
    if (jid.includes("@g.us") || jid.includes("broadcast") || jid.includes("@newsletter")) diag.skippedGroups++;
    else diag.skippedLid++;
  };

  const people = new Map<string, { name: string | null; jid: string | null }>();
  const put = (phone: string, name: string | null, jid: string | null) => {
    const cur = people.get(phone);
    if (!cur) { people.set(phone, { name, jid }); return; }
    if (!cur.name && name) cur.name = name;
    if (!cur.jid && jid) cur.jid = jid;
  };

  const rc = await tf(`${baseUrl}/chat/findContacts/${enc}`, { method: "POST", headers: H, body: "{}" });
  const ca = Array.isArray(rc.json) ? rc.json : (Array.isArray(rc.json?.data) ? rc.json.data : []);
  out.fetchedContacts = ca.length;
  for (const c of ca) {
    const jid = pickJid(c); const p = jid ? jidPhone(jid) : null;
    if (!p) { conta(c); continue; }
    put(p, pickName(c), jid);
  }

  const rh = await tf(`${baseUrl}/chat/findChats/${enc}`, { method: "POST", headers: H, body: "{}" });
  const ha = Array.isArray(rh.json) ? rh.json : (Array.isArray(rh.json?.data) ? rh.json.data : []);
  out.fetchedChats = ha.length;
  const chats: any[] = []; const chatLabels: any[] = [];
  for (const c of ha) {
    const jid = pickJid(c); const p = jid ? jidPhone(jid) : null;
    if (!p) { conta(c); continue; }
    const name = pickName(c);
    put(p, name, jid);
    const lm = c?.lastMessage?.message || c?.lastMessage;
    const last_message = lm?.conversation || lm?.extendedTextMessage?.text || c?.lastMessage?.body || "";
    const last_at = tsToIso(c?.lastMessage?.messageTimestamp || c?.updatedAt || c?.lastMsgTimestamp) || "";
    chats.push({ phone: p, name, jid, last_message, last_at });
    const ids = chatLabelIds(c);
    if (ids.length) chatLabels.push({ phone: p, labels: ids });
  }

  const crows = Array.from(people.entries()).map(([phone, v]) => ({ phone, name: v.name, jid: v.jid }));
  for (let i = 0; i < crows.length; i += 500) {
    const { data, error } = await db.rpc("crm_import_contacts", { _org: orgId, _rows: crows.slice(i, i + 500) });
    if (error) { diag.rpcErrors.push({ fn: "crm_import_contacts", lote: i, erro: error.message }); console.error("importAll contatos", error); }
    out.contacts += (data as number) ?? 0;
  }
  for (let i = 0; i < chats.length; i += 300) {
    // _connection e OBRIGATORIO. Sem ele o Postgres resolvia para o overload de
    // 2 argumentos, que escolhe a conexao PADRAO da organizacao em vez da que
    // disparou o import: em 17/08 as 189 conversas lidas da COMERCIAL foram
    // gravadas dentro da ATENDIMENTO.
    const { data, error } = await db.rpc("crm_import_chats", { _org: orgId, _connection: connId, _rows: chats.slice(i, i + 300) });
    if (error) { diag.rpcErrors.push({ fn: "crm_import_chats", lote: i, erro: error.message }); console.error("importAll chats", error); }
    out.conversas += (data as number) ?? 0;
  }

  try {
    const labs = await fetchLabels(baseUrl, enc, H, diag);
    const lrows = (labs ?? []).map((l: any) => ({
      external_id: String(l?.id ?? l?.labelId ?? l?.predefinedId ?? l?.name ?? ""),
      label: cleanName(l?.name) || cleanName(l?.label) || cleanName(l?.labelName) || null,
      color: labelColor(l?.color ?? l?.colorIndex ?? l?.hexColor),
    })).filter((l: any) => l.label);
    if (lrows.length) { const { data } = await db.rpc("crm_import_labels", { _org: orgId, _rows: lrows }); out.labels = (data as number) ?? 0; }
    for (let i = 0; i < chatLabels.length; i += 300) {
      const { data } = await db.rpc("crm_apply_chat_labels", { _org: orgId, _rows: chatLabels.slice(i, i + 300) });
      out.labelLinks += (data as number) ?? 0;
    }
    diag.chatsWithLabels = chatLabels.length;
  } catch (e) { diag.labelError = String(e); }

  out.diag = diag;
  if (connId) { try { await db.from("whatsapp_connections").update({ last_import_stats: out }).eq("id", connId); } catch { /* ignore */ } }
  return out;
}

/** Saudação p/ contato novo e mensagem de ausência fora do horário (sem depender de IA). */
async function runAutoMessages(db: any, conn: any, phone: string, msgId: string) {
  try {
    const { data: cfg } = await db.from("crm_auto_messages").select("*").eq("organization_id", conn.organization_id).maybeSingle();
    if (!cfg || (!cfg.greeting_enabled && !cfg.away_enabled)) return;

    // se o agente de IA vai responder, ele assume — não duplica mensagens
    const { data: ai } = await db.from("ai_agent_settings").select("enabled, auto_reply").eq("organization_id", conn.organization_id).maybeSingle();

    const { data: msg } = await db.from("messages").select("conversation_id").eq("id", msgId).maybeSingle();
    if (!msg) return;
    const { data: conv } = await db.from("conversations")
      .select("id, greeted_at, away_sent_at, ai_mode, contact:crm_contacts(id, name, phone)")
      .eq("id", msg.conversation_id).maybeSingle();
    if (!conv?.contact) return;
    const aiActive = !!ai?.enabled && !!ai?.auto_reply && conv.ai_mode !== "off";
    if (aiActive) return;

    // dentro/fora do horário de atendimento (fuso da clínica)
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: cfg.timezone || "America/Sao_Paulo", hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
    const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(parts.find(p => p.type === "weekday")?.value ?? "Sun");
    const hhmm = `${parts.find(p => p.type === "hour")?.value ?? "00"}:${parts.find(p => p.type === "minute")?.value ?? "00"}`;
    const range = (cfg.business_hours ?? {})[String(wd)];
    const withinHours = Array.isArray(range) && range.length === 2 && hhmm >= range[0] && hhmm < range[1];

    const firstName = (() => {
      const n = (conv.contact.name ?? "").trim();
      return n && !/^[\d\s()+-]*$/.test(n) ? n.split(/\s+/)[0] : "";
    })();
    const fill = (t: string) => t
      .replaceAll("{nome_cliente}", firstName || "tudo bem")
      .replaceAll("{horario}", Object.entries(cfg.business_hours ?? {}).map(([d, r]: [string, any]) =>
        `${["dom","seg","ter","qua","qui","sex","sáb"][Number(d)]} ${r?.[0]}–${r?.[1]}`).join(", "));

    const send = async (texto: string) => {
      const base = (conn.base_url || "").replace(/\/+$/, "");
      if (!base || !conn.api_key) return false;
      const r = await fetch(`${base}/message/sendText/${encodeURIComponent(conn.instance_name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: conn.api_key },
        body: JSON.stringify({ number: conv.contact.phone.replace(/\D/g, ""), text: texto }),
      });
      return r.ok; // o próprio evento SEND_MESSAGE traz a mensagem de volta ao CRM
    };

    // Saudação: só na primeira interação da conversa (nunca respondemos antes)
    if (cfg.greeting_enabled && !conv.greeted_at) {
      const { count: outCount } = await db.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id).eq("direction", "out");
      if ((outCount ?? 0) === 0 && withinHours) {
        if (await send(fill(cfg.greeting_text))) {
          await db.from("conversations").update({ greeted_at: new Date().toISOString() }).eq("id", conv.id);
          return; // não empilha ausência em cima da saudação
        }
      }
    }

    // Ausência: fora do horário, no máximo 1 a cada 12h por conversa
    if (cfg.away_enabled && !withinHours) {
      const last = conv.away_sent_at ? new Date(conv.away_sent_at).getTime() : 0;
      if (Date.now() - last > 12 * 3600_000) {
        if (await send(fill(cfg.away_text))) {
          await db.from("conversations").update({ away_sent_at: new Date().toISOString() }).eq("id", conv.id);
        }
      }
    }
  } catch { /* nunca derruba o webhook */ }
}

function normalizeMessage(payload: any) {
  const d = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  if (!d?.key) return null;
  const remoteJid: string = d.key.remoteJid || "";
  if (remoteJid.endsWith("@g.us")) return null;
  // LID é id interno do WhatsApp — usa o JID de telefone quando disponível, senão ignora.
  const jid = remoteJid.includes("@lid")
    ? (typeof d.key.remoteJidAlt === "string" ? d.key.remoteJidAlt : (typeof d.key.senderPn === "string" ? d.key.senderPn : ""))
    : remoteJid;
  const phone = jidPhone(jid);
  if (!phone) return null;
  const msg = d.message ?? {};
  const content = msg.conversation ?? msg.extendedTextMessage?.text ?? msg.imageMessage?.caption ?? msg.videoMessage?.caption ?? "";
  const type = msg.imageMessage ? "image" : msg.audioMessage ? "audio" : msg.videoMessage ? "video" : msg.documentMessage ? "document" : "text";
  const tsSec = Number(d.messageTimestamp ?? 0);
  const fromMe = !!d.key.fromMe;
  const media = msg.imageMessage || msg.audioMessage || msg.videoMessage || msg.documentMessage || null;
  const fileName = msg.documentMessage?.fileName || media?.fileName || null;
  const mimeType = media?.mimetype || media?.mimeType || null;
  // O pushName é sempre o nome de QUEM ENVIOU. Numa mensagem nossa ele é o
  // nome do nosso próprio perfil ("Instituto Vert"), não o do contato — por
  // isso só aproveitamos o pushName quando a mensagem foi recebida.
  return { phone, pushName: fromMe ? null : cleanName(d.pushName), direction: fromMe ? "out" : "in", content, type, providerMessageId: d.key.id ?? null, messageAt: tsSec ? new Date(tsSec * 1000).toISOString() : new Date().toISOString(), rawMessage: d, fileName, mimeType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const connectionId = url.searchParams.get("connectionId");
  const secret = url.searchParams.get("secret");
  if (!connectionId || !secret) return json({ error: "missing connectionId/secret" }, 400);
  const raw = await req.text();
  let payload: any = {}; try { payload = JSON.parse(raw || "{}"); } catch { /* {} */ }
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: conn } = await db.from("whatsapp_connections")
    .select("id, organization_id, webhook_secret, instance_name, base_url, api_key, last_import_at")
    .eq("id", connectionId).maybeSingle();
  if (!conn) return json({ error: "unknown connection" }, 404);
  if (conn.webhook_secret !== secret) return json({ error: "invalid secret" }, 401);

  const eventType = (payload.event || payload.type || "unknown").toString();

  // Controle: atualiza o endereço do túnel (auto-heal).
  if (eventType === "crm.set_base_url" && typeof payload.base_url === "string" && /^https?:\/\//.test(payload.base_url)) {
    await db.from("whatsapp_connections").update({ base_url: payload.base_url.replace(/\/+$/, ""), updated_at: new Date().toISOString() }).eq("id", conn.id);
    return json({ ok: true, event: eventType, base_url: payload.base_url });
  }

  await db.from("webhook_inbox").insert({ organization_id: conn.organization_id, connection_id: conn.id, provider: "evolution", event_type: eventType, payload });

  if (eventType.toLowerCase().includes("connection")) {
    const state = (Array.isArray(payload.data) ? payload.data[0] : payload.data)?.state ?? payload?.data?.connection;
    const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
    await db.from("whatsapp_connections").update({ status, last_status_at: new Date().toISOString() }).eq("id", conn.id);
    // Auto-import ao conectar (debounce 6h).
    if (state === "open" && conn.base_url && (conn as any).api_key && conn.instance_name) {
      const li = (conn as any).last_import_at ? new Date((conn as any).last_import_at).getTime() : 0;
      if (Date.now() - li > 6 * 3600 * 1000) {
        await db.from("whatsapp_connections").update({ last_import_at: new Date().toISOString() }).eq("id", conn.id);
        // Ao conectar, tres servicos em fila, todos em lotes e todos se
        // reagendando sozinhos ate zerar: contatos/conversas, depois as fotos,
        // depois o historico de mensagens. Em fila e nao em paralelo para nao
        // disputar a mesma instancia da Evolution.
        const chama = (fn: string) => fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: conn.organization_id, connectionId: conn.id }),
        }).then(() => undefined).catch(() => undefined);
        const task = importAll(db, conn.organization_id, (conn.base_url as string).replace(/\/+$/, ""), conn.instance_name as string, (conn as any).api_key as string, conn.id as string)
          .then(() => chama("crm-avatars"))
          .then(() => chama("crm-history-import"));
        try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(task) : await task; } catch { /* ignore */ }
      }
    }
    return json({ ok: true, event: eventType, status });
  }

  // Fotos de perfil: a Evolution avisa quando o contato troca a imagem.
  // É isso que mantém o avatar em dia sem ninguém clicar em nada.
  if (eventType.toLowerCase().startsWith("contacts.")) {
    const lista = Array.isArray(payload.data) ? payload.data : [payload.data];
    const tarefas: Promise<void>[] = [];
    for (const item of lista) {
      if (!item) continue;
      const phone = jidPhone(pickJid(item) ?? item?.id ?? item?.remoteJid);
      const foto = item?.profilePicUrl ?? item?.profilePictureUrl ?? null;
      if (phone && foto) tarefas.push(sincronizaFotoDoContato(db, conn, phone, foto));
    }
    if (tarefas.length) {
      const tudo = Promise.all(tarefas).then(() => undefined);
      try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(tudo) : await tudo; } catch { /* ignore */ }
    }
    return json({ ok: true, event: eventType, fotos: tarefas.length });
  }

  // Etiquetas do WhatsApp (criadas/renomeadas ou aplicadas a um chat).
  if (eventType.toLowerCase().includes("label")) {
    const d = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    const ev = eventType.toLowerCase();
    if (ev.includes("association")) {
      const jid = d?.chatId ?? d?.remoteJid ?? d?.jid ?? "";
      const phone = jidPhone(jid);
      const labelId = d?.labelId ?? d?.label?.id ?? null;
      const add = (d?.type ?? d?.action ?? "add").toString().toLowerCase() !== "remove";
      if (phone && labelId != null) {
        await db.rpc("crm_toggle_chat_label", { _org: conn.organization_id, _phone: phone, _label_ext: String(labelId), _add: add });
      }
      return json({ ok: true, event: eventType });
    }
    const rows = (Array.isArray(payload.data) ? payload.data : [d]).filter(Boolean).map((l: any) => ({
      external_id: String(l?.id ?? l?.labelId ?? l?.predefinedId ?? l?.name ?? ""),
      label: cleanName(l?.name) || cleanName(l?.label) || cleanName(l?.labelName) || null,
      color: labelColor(l?.color ?? l?.colorIndex ?? l?.hexColor),
    })).filter((l: any) => l.label);
    if (rows.length) await db.rpc("crm_import_labels", { _org: conn.organization_id, _rows: rows });
    return json({ ok: true, event: eventType, labels: rows.length });
  }

  if (eventType.toLowerCase().includes("messages") || eventType.toLowerCase().includes("send")) {
    const n = normalizeMessage(payload);
    if (!n) return json({ ok: true, ignored: true });
    const dedupe = `${conn.id}:${n.providerMessageId ?? n.messageAt}`;
    const { error: dupErr } = await db.from("provider_events").insert({ organization_id: conn.organization_id, connection_id: conn.id, provider: "evolution", dedupe_key: dedupe, event_type: eventType });
    if (dupErr) return json({ ok: true, duplicated: true });
    const { data: msgId, error: ingErr } = await db.rpc("crm_ingest_message", { _org: conn.organization_id, _connection: conn.id, _phone: n.phone, _push_name: n.pushName, _direction: n.direction, _content: n.content, _provider_msg_id: n.providerMessageId, _msg_at: n.messageAt, _type: n.type });
    if (ingErr) return json({ error: ingErr.message }, 500);

    if (msgId && n.type !== "text") {
      const { data: storedMessage } = await db.from("messages").select("conversation_id").eq("id", msgId).maybeSingle();
      if (storedMessage?.conversation_id) {
        const mediaTask = persistIncomingMedia(db, conn, msgId as string, storedMessage.conversation_id as string, n);
        try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(mediaTask) : await mediaTask; } catch { /* ignore */ }
      }
    }

    // Contato novo (ou visto há muito tempo) ganha foto sem ninguém pedir.
    if (n.direction === "in" && msgId) {
      const fotoTask = sincronizaFotoDoContato(db, conn, n.phone);
      try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(fotoTask) : await fotoTask; } catch { /* ignore */ }
    }

    // Saudação/ausência automáticas (independem de IA; o agente tem prioridade)
    if (n.direction === "in" && msgId) {
      const autoTask = runAutoMessages(db, conn, n.phone, msgId as string);
      try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(autoTask) : await autoTask; } catch { /* ignore */ }
    }

    // OCR financeiro independente do agente: imagens e PDFs viram comprovantes pendentes de revisão.
    if (n.direction === "in" && msgId && (n.type === "image" || n.type === "document")) {
      const receiptTask = fetch(`${SUPABASE_URL}/functions/v1/crm-receipt-ocr`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: conn.organization_id,
          phone: n.phone,
          providerMessageId: n.providerMessageId,
          messageType: n.type,
        }),
      }).catch(() => {});
      try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(receiptTask) : await receiptTask; } catch { /* ignore */ }
    }

    // Agente de IA: mensagem recebida dispara o agente em segundo plano.
    // Ele mesmo decide se está ativado (interruptor geral + modo da conversa).
    if (n.direction === "in" && msgId) {
      const aiTask = fetch(`${SUPABASE_URL}/functions/v1/crm-ai-agent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: conn.organization_id,
          phone: n.phone,
          providerMessageId: n.providerMessageId,
          messageType: n.type,
        }),
      }).catch(() => {});
      try { (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(aiTask) : await aiTask; } catch { /* ignore */ }
    }

    return json({ ok: true, event: eventType, messageId: msgId, duplicated: msgId === null });
  }

  return json({ ok: true, event: eventType, handled: false });
});
