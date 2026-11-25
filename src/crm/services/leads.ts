import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import { onlyDigits, isUsableName } from "../sdk/phone";
import type { EtapaFunil } from "../sdk/funil";
import type { CrmConversation } from "../sdk/types";

export interface CrmLeadRow {
  id: string;
  status: string | null;
  temperature: string | null;
  source: string | null;
  intent: string | null;
  entry_page: string | null;
  estimated_value: number | null;
  created_at: string;
  contact: { id: string; name: string | null; phone: string | null; patient_id: string | null } | null;
}

/**
 * O painel ativo e as conexões antigas do mesmo número (ex.: a Evolution que
 * virou Zernio). Os leads gravados na conexão antiga continuam aparecendo.
 */
export async function conexoesDoMesmoNumero(organizationId: string, activeConnectionId: string): Promise<string[]> {
  const { data } = await supabase
    .from("whatsapp_connections")
    .select("id, phone_number")
    .eq("organization_id", organizationId);
  const lista = (data ?? []) as { id: string; phone_number: string | null }[];
  const fim = (t: string | null) => (t ?? "").replace(/\D/g, "").slice(-10);
  const alvo = fim(lista.find((c) => c.id === activeConnectionId)?.phone_number ?? null);
  const ids = alvo ? lista.filter((c) => fim(c.phone_number) === alvo).map((c) => c.id) : [];
  return ids.includes(activeConnectionId) ? ids : [activeConnectionId, ...ids];
}

export function useLeadsList(status: string) {
  const { organizationId, activeConnectionId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-leads-list", organizationId, activeConnectionId, status],
    enabled: !!organizationId && !!activeConnectionId,
    staleTime: 15_000,
    queryFn: async (): Promise<CrmLeadRow[]> => {
      const conexoes = await conexoesDoMesmoNumero(organizationId!, activeConnectionId!);
      let query = supabase
        .from("crm_leads")
        .select("id, status, temperature, source, intent, entry_page, estimated_value, created_at, contact:crm_contacts(id, name, phone, patient_id)")
        .eq("organization_id", organizationId)
        .in("connection_id", conexoes)
        .order("created_at", { ascending: false })
        .limit(300);
      if (status && status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CrmLeadRow[];
    },
  });
}

/**
 * Muda a etapa do funil de uma conversa. Se o contato ainda não é lead neste
 * número (chamou direto no WhatsApp), cria o lead já na etapa escolhida.
 */
export function useSetLeadStage() {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  /** Devolve o id do lead (o existente ou o recém-criado). */
  return async (conversation: CrmConversation, etapa: EtapaFunil): Promise<string> => {
    let leadId = conversation.leadId ?? null;
    if (leadId) {
      const { error } = await supabase.from("crm_leads").update({ status: etapa }).eq("id", leadId);
      if (error) throw error;
    } else {
      if (!conversation.connectionId) throw new Error("Conversa sem número de WhatsApp.");
      const { data, error } = await supabase
        .from("crm_leads")
        .insert({
          organization_id: organizationId,
          connection_id: conversation.connectionId,
          contact_id: conversation.contact.id,
          status: etapa,
          source: "whatsapp",
        })
        .select("id")
        .single();
      if (error) throw error;
      leadId = data.id as string;
      await supabase.from("crm_contacts").update({ is_lead: true }).eq("id", conversation.contact.id);
    }
    qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId] });
    qc.invalidateQueries({ queryKey: ["crm-leads-list", organizationId] });
    return leadId;
  };
}

/** Muda a etapa direto pelo id do lead (quadro do funil). */
export function useUpdateLeadStatus() {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  return async (leadId: string, etapa: EtapaFunil): Promise<void> => {
    const { error } = await supabase.from("crm_leads").update({ status: etapa }).eq("id", leadId);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["crm-leads-list", organizationId] });
    qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId] });
  };
}

export interface NewLeadInput {
  name: string;
  phone: string;
  source: string | null;
  temperature: string | null;
  procedureId: string | null;
  estimatedValue: number | null;
}

/** Cria o lead e a conversa no painel ativo, sem misturar os dois WhatsApps. */
export function useCreateLead() {
  const { organizationId, activeConnectionId } = useCrmContext();
  const qc = useQueryClient();
  return async (input: NewLeadInput): Promise<void> => {
    if (!activeConnectionId) throw new Error("Nenhum painel de WhatsApp liberado.");
    const digits = onlyDigits(input.phone);
    const normalized = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
    if (normalized.length < 10) throw new Error("Informe DDD + número.");

    const { data: conversationId, error: conversationError } = await supabase.rpc("crm_start_conversation", {
      _phone: digits,
      _name: input.name.trim() || null,
      _patient: null,
      _connection: activeConnectionId,
    } as any);
    if (conversationError) throw conversationError;

    const { data: conversation, error: fetchError } = await supabase
      .from("conversations")
      .select("contact_id")
      .eq("id", conversationId as unknown as string)
      .eq("connection_id", activeConnectionId)
      .single();
    if (fetchError || !conversation?.contact_id) throw fetchError ?? new Error("Contato não encontrado.");
    const contactId = conversation.contact_id as string;

    const { data: contact } = await supabase.from("crm_contacts").select("name").eq("id", contactId).maybeSingle();
    if (input.name.trim() && !isUsableName(contact?.name)) {
      await supabase.from("crm_contacts").update({ name: input.name.trim(), is_lead: true }).eq("id", contactId);
    } else {
      await supabase.from("crm_contacts").update({ is_lead: true }).eq("id", contactId);
    }

    const { data: openLead } = await supabase
      .from("crm_leads")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("connection_id", activeConnectionId)
      .eq("contact_id", contactId)
      .limit(1)
      .maybeSingle();
    if (openLead) throw new Error("Já existe um lead para este contato neste painel.");

    const { error: leadError } = await supabase.from("crm_leads").insert({
      organization_id: organizationId,
      connection_id: activeConnectionId,
      contact_id: contactId,
      status: "novo",
      temperature: input.temperature,
      source: input.source,
      interest_procedure_id: input.procedureId,
      estimated_value: input.estimatedValue,
    });
    if (leadError) throw leadError;
    qc.invalidateQueries({ queryKey: ["crm-leads-list", organizationId, activeConnectionId] });
    qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId, activeConnectionId] });
  };
}
