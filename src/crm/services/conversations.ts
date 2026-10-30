import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import type { CrmConversation, CrmMessage, CrmTag, InboxFilterKey } from "../sdk/types";
import { DEMO_CONVERSATIONS, DEMO_MESSAGES, isDemoMode } from "./demo";
import { resolverAvatares } from "./avatars";

// Camada de serviço da caixa de entrada — dados reais do Supabase (com fallback de demo via ?demo=1).

export function matchesFilter(c: CrmConversation, filter: InboxFilterKey): boolean {
  switch (filter) {
    case "all": return true;
    case "unread": return c.unread > 0;
    case "patients": return c.isPatient;
    case "in_progress": return c.status === "em_atendimento";
    case "waiting": return c.status === "aguardando";
    case "closed": return c.status === "finalizado";
    case "unassigned": return !c.assigneeName;
    default: return true;
  }
}

function mapRow(r: any, users?: Record<string, string>, tagsByContact?: Record<string, CrmTag[]>): CrmConversation {
  const contact = r.contact ?? {};
  const connection = Array.isArray(r.connection) ? r.connection[0] ?? {} : r.connection ?? {};
  const contactId = contact.id ?? r.contact_id;
  return {
    id: r.id,
    connectionId: r.connection_id ?? connection.id ?? null,
    connectionName: connection.display_name ?? connection.phone_number ?? connection.instance_name ?? null,
    connectionPhone: connection.phone_number ?? null,
    contact: {
      id: contactId,
      name: contact.name ?? "Sem nome",
      phone: contact.phone ?? "",
      avatarUrl: contact.avatar_url ?? null,
      city: contact.city ?? null,
      unit: null,
      patientId: contact.patient_id ?? null,
    },
    tags: tagsByContact?.[contactId] ?? [],
    status: r.status ?? "novo",
    lastMessage: r.last_message_preview ?? "",
    lastMessageAt: r.last_message_at ?? r.created_at,
    unread: r.unread_count ?? 0,
    primaryTag: r.procedure?.name ?? null,
    interest: r.procedure?.name ?? null,
    assigneeName: r.assignee_id ? (users?.[r.assignee_id] ?? "Responsável") : null,
    priority: r.priority ?? null,
    isNewLead: !!r.is_new_lead,
    isPatient: !!contact.patient_id,
    aiMode: (r.ai_mode as "default" | "on" | "off") ?? "default",
  };
}

async function fetchConversations(orgId: string, connectionId: string): Promise<CrmConversation[]> {
  const [{ data, error }, usersRes, tagsRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, contact_id, connection_id, status, priority, is_new_lead, ai_mode, unread_count, assignee_id, last_message_preview, last_message_at, created_at, connection:whatsapp_connections(id, display_name, phone_number, instance_name), contact:crm_contacts(id, name, phone, avatar_url, city, patient_id), procedure:procedures(name)")
      .eq("organization_id", orgId)
      .eq("connection_id", connectionId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase.from("profiles").select("id, full_name, email").eq("organization_id", orgId),
    supabase.from("contact_tags").select("contact_id, tag:tags(id, label, color, source)").eq("organization_id", orgId).limit(5000),
  ]);
  if (error) throw error;
  const users: Record<string, string> = {};
  (usersRes.data ?? []).forEach((p: any) => { users[p.id] = p.full_name || p.email || "Usuário"; });

  // contato -> etiquetas (as do WhatsApp vêm primeiro)
  const tagsByContact: Record<string, CrmTag[]> = {};
  (tagsRes.data ?? []).forEach((row: any) => {
    const t = row.tag;
    if (!t) return;
    const list = (tagsByContact[row.contact_id] ??= []);
    if (!list.some((x) => x.id === t.id)) list.push({ id: t.id, label: t.label, color: t.color ?? null, source: t.source ?? null });
  });
  Object.values(tagsByContact).forEach((list) =>
    list.sort((a, b) => (a.source === "whatsapp" ? 0 : 1) - (b.source === "whatsapp" ? 0 : 1) || a.label.localeCompare(b.label)),
  );

  const lista = (data ?? []).map((r) => mapRow(r, users, tagsByContact));
  // as fotos vêm como referência interna do bucket; assina todas de uma vez
  const fotos = await resolverAvatares(lista.map((c) => c.contact.avatarUrl));
  lista.forEach((c, i) => { c.contact.avatarUrl = fotos[i]; });
  return lista;
}

/** Assina Realtime de conversas/mensagens da organização e invalida as queries. */
export function useCrmRealtime() {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  useEffect(() => {
    if (isDemoMode() || !organizationId) return;
    const ch = supabase
      .channel(`crm-${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` },
        () => qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `organization_id=eq.${organizationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["crm-messages"] });
          qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [organizationId, qc]);
}

function useConversationList(): CrmConversation[] {
  const { organizationId, activeConnectionId } = useCrmContext();
  const demo = isDemoMode();
  const { data } = useQuery({
    queryKey: ["crm-conversations", organizationId, activeConnectionId],
    queryFn: () => fetchConversations(organizationId, activeConnectionId!),
    enabled: !demo && !!organizationId && !!activeConnectionId,
    staleTime: 15_000,
  });
  return demo ? DEMO_CONVERSATIONS : (data ?? []);
}

export function useConversations(filter: InboxFilterKey, search: string, tagId?: string | null, connectionId?: string | null): CrmConversation[] {
  const base = useConversationList();
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return base
      .filter((c) => matchesFilter(c, filter))
      .filter((c) => !connectionId || c.connectionId === connectionId)
      .filter((c) => !tagId || (c.tags ?? []).some((t) => t.id === tagId))
      .filter((c) => !q || c.contact.name.toLowerCase().includes(q) || (!!digits && c.contact.phone.includes(digits)))
      .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  }, [base, filter, search, tagId, connectionId]);
}

export function useInboxCounts(): Record<InboxFilterKey, number> {
  const base = useConversationList();
  return useMemo(() => {
    const keys: InboxFilterKey[] = ["all", "unread", "patients", "in_progress", "waiting", "closed", "unassigned"];
    const out = {} as Record<InboxFilterKey, number>;
    keys.forEach((k) => { out[k] = base.filter((c) => matchesFilter(c, k)).length; });
    return out;
  }, [base]);
}

/** Etiquetas presentes nas conversas (as do WhatsApp primeiro), com a contagem de cada uma. */
export function useInboxTags(): (CrmTag & { count: number })[] {
  const base = useConversationList();
  return useMemo(() => {
    const map = new Map<string, CrmTag & { count: number }>();
    base.forEach((c) => (c.tags ?? []).forEach((t) => {
      const cur = map.get(t.id);
      if (cur) cur.count += 1;
      else map.set(t.id, { ...t, count: 1 });
    }));
    return Array.from(map.values()).sort(
      (a, b) => (a.source === "whatsapp" ? 0 : 1) - (b.source === "whatsapp" ? 0 : 1) || b.count - a.count || a.label.localeCompare(b.label),
    );
  }, [base]);
}

async function fetchMessages(conversationId: string): Promise<CrmMessage[]> {
  // Busca as 500 MAIS RECENTES (desc) e devolve em ordem cronológica.
  // Com histórico grande (>500), ordem crescente cortava justamente as novas.
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, direction, type, content, media_url, delivery_status, message_at")
    .eq("conversation_id", conversationId)
    .order("message_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).reverse().map((m: any) => ({
    id: m.id,
    conversationId: m.conversation_id,
    direction: m.direction,
    type: m.type,
    content: m.content ?? "",
    mediaUrl: m.media_url,
    createdAt: m.message_at,
    deliveryStatus: m.delivery_status,
  }));
}

export function useMessages(conversationId: string | null): CrmMessage[] {
  const demo = isDemoMode();
  const { data } = useQuery({
    queryKey: ["crm-messages", conversationId],
    queryFn: () => fetchMessages(conversationId!),
    enabled: !demo && !!conversationId,
    staleTime: 5_000,
  });
  if (demo) return conversationId ? DEMO_MESSAGES[conversationId] ?? [] : [];
  return data ?? [];
}
