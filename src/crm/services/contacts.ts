import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import { resolverAvatares } from "./avatars";

export interface CrmContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  patient_id: string | null;
  is_lead: boolean;
  created_at: string;
}

async function panelContactIds(organizationId: string, connectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("contact_id")
    .eq("organization_id", organizationId)
    .eq("connection_id", connectionId)
    .limit(3000);
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row: any) => row.contact_id).filter(Boolean)));
}

async function fetchPanelContacts(
  organizationId: string,
  connectionId: string,
  search = "",
  limit = 300,
): Promise<CrmContactRow[]> {
  const ids = await panelContactIds(organizationId, connectionId);
  if (!ids.length) return [];
  let query = supabase
    .from("crm_contacts")
    .select("id, name, phone, avatar_url, city, patient_id, is_lead, created_at")
    .eq("organization_id", organizationId)
    .in("id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  const clean = search.trim();
  if (clean.length >= 2) query = query.or(`name.ilike.%${clean}%,phone.ilike.%${clean}%`);
  const { data, error } = await query;
  if (error) throw error;
  const linhas = (data ?? []) as CrmContactRow[];
  const fotos = await resolverAvatares(linhas.map((c) => c.avatar_url));
  linhas.forEach((c, i) => { c.avatar_url = fotos[i]; });
  return linhas;
}

export function useContactsList(search: string) {
  const { organizationId, activeConnectionId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-contacts-list", organizationId, activeConnectionId, search.trim()],
    enabled: !!organizationId && !!activeConnectionId,
    staleTime: 15_000,
    queryFn: () => fetchPanelContacts(organizationId, activeConnectionId!, search),
  });
}

/** Renomeia um contato compartilhado, desde que o usuario tenha acesso ao painel. */
export function useRenameContact() {
  const { organizationId, activeConnectionId } = useCrmContext();
  const qc = useQueryClient();
  return async (contactId: string, name: string) => {
    const clean = name.trim();
    if (clean.length < 2) throw new Error("Informe um nome com pelo menos 2 letras.");
    if (!activeConnectionId) throw new Error("Nenhum painel de WhatsApp liberado.");
    const { error } = await supabase
      .from("crm_contacts")
      .update({ name: clean, updated_at: new Date().toISOString() })
      .eq("id", contactId)
      .eq("organization_id", organizationId);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId, activeConnectionId] });
    qc.invalidateQueries({ queryKey: ["crm-contacts-list", organizationId, activeConnectionId] });
    qc.invalidateQueries({ queryKey: ["crm-contact-search", organizationId, activeConnectionId] });
  };
}

export function useContactsKpis() {
  const { organizationId, activeConnectionId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-contacts-kpis", organizationId, activeConnectionId],
    enabled: !!organizationId && !!activeConnectionId,
    staleTime: 60_000,
    queryFn: async () => {
      const contacts = await fetchPanelContacts(organizationId, activeConnectionId!, "", 3000);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      return {
        total: contacts.length,
        pacientes: contacts.filter((contact) => !!contact.patient_id).length,
        novosNoMes: contacts.filter((contact) => new Date(contact.created_at) >= monthStart).length,
        leads: contacts.filter((contact) => contact.is_lead).length,
      };
    },
  });
}

export function useContactsCount() {
  const { organizationId, activeConnectionId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-contacts-count", organizationId, activeConnectionId],
    enabled: !!organizationId && !!activeConnectionId,
    staleTime: 30_000,
    queryFn: async () => (await panelContactIds(organizationId, activeConnectionId!)).length,
  });
}
