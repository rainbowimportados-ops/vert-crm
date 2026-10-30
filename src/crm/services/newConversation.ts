import { supabase } from "@/integrations/supabase/client";
import type { CrmConversation } from "../sdk/types";
import { resolverAvatares } from "./avatars";

export interface ContactHit {
  kind: "contact" | "patient";
  id: string;
  name: string;
  phone: string;
  patientId: string | null;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * Busca contatos do painel ativo e, se a integração de pacientes estiver
 * ligada, pacientes da clínica por nome/telefone.
 */
export async function searchContactsAndPatients(orgId: string, query: string, connectionId: string, incluirPacientes = false): Promise<ContactHit[]> {
  const q = query.trim();
  if (q.length < 2 || !connectionId) return [];
  const like = `%${q}%`;
  const { data: conversationRows, error: conversationError } = await supabase
    .from("conversations")
    .select("contact_id")
    .eq("organization_id", orgId)
    .eq("connection_id", connectionId)
    .limit(1000);
  if (conversationError) throw conversationError;
  const contactIds = Array.from(new Set((conversationRows ?? []).map((row: any) => row.contact_id).filter(Boolean)));

  const contactsPromise = contactIds.length
    ? supabase.from("crm_contacts")
        .select("id, name, phone, patient_id")
        .eq("organization_id", orgId).is("deleted_at", null)
        .in("id", contactIds)
        .or(`name.ilike.${like},phone.ilike.${like}`).limit(8)
    : Promise.resolve({ data: [], error: null } as any);
  const [contactsRes, patientsRes] = await Promise.all([
    contactsPromise,
    incluirPacientes
      ? supabase.from("patients")
          .select("id, name, phone, whatsapp")
          .eq("organization_id", orgId)
          .or(`name.ilike.${like},phone.ilike.${like},whatsapp.ilike.${like}`).limit(8)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if ((contactsRes as any).error) throw (contactsRes as any).error;
  if (patientsRes.error) throw patientsRes.error;

  const hits: ContactHit[] = [];
  const seen = new Set<string>();
  for (const contact of ((contactsRes as any).data ?? []) as any[]) {
    const normalized = digits(contact.phone);
    if (normalized) seen.add(normalized);
    hits.push({ kind: "contact", id: contact.id, name: contact.name || contact.phone || "Sem nome", phone: contact.phone || "", patientId: contact.patient_id ?? null });
  }
  for (const patient of (patientsRes.data ?? []) as any[]) {
    const phone = patient.whatsapp || patient.phone || "";
    const normalized = digits(phone);
    if (normalized && seen.has(normalized)) continue;
    hits.push({ kind: "patient", id: patient.id, name: patient.name || phone || "Paciente", phone, patientId: patient.id });
  }
  return hits;
}

async function fetchConversationById(convId: string): Promise<CrmConversation | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id, contact_id, connection_id, status, priority, is_new_lead, unread_count, assignee_id, last_message_preview, last_message_at, created_at, connection:whatsapp_connections(id, display_name, phone_number, instance_name), contact:crm_contacts(id, name, phone, avatar_url, city, patient_id), procedure:procedures(name)")
    .eq("id", convId).maybeSingle();
  if (!data) return null;
  const r: any = data;
  const contact = r.contact ?? {};
  const [foto] = await resolverAvatares([contact.avatar_url ?? null]);
  const connection = Array.isArray(r.connection) ? r.connection[0] ?? {} : r.connection ?? {};
  return {
    id: r.id,
    connectionId: r.connection_id ?? connection.id ?? null,
    connectionName: connection.display_name ?? connection.phone_number ?? connection.instance_name ?? null,
    connectionPhone: connection.phone_number ?? null,
    contact: {
      id: contact.id ?? r.contact_id,
      name: contact.name ?? "Sem nome",
      phone: contact.phone ?? "",
      avatarUrl: foto,
      city: contact.city ?? null,
      unit: null,
      patientId: contact.patient_id ?? null,
    },
    status: r.status ?? "novo",
    lastMessage: r.last_message_preview ?? "",
    lastMessageAt: r.last_message_at ?? r.created_at,
    unread: r.unread_count ?? 0,
    primaryTag: r.procedure?.name ?? null,
    interest: r.procedure?.name ?? null,
    assigneeName: null,
    priority: r.priority ?? null,
    isNewLead: !!r.is_new_lead,
    isPatient: !!contact.patient_id,
  } as CrmConversation;
}

/** Cria (ou reabre) a conversa e devolve o objeto pronto para abrir no inbox. */
export async function startConversation(params: { phone: string; name?: string | null; patientId?: string | null; connectionId: string }): Promise<CrmConversation | null> {
  const { data, error } = await supabase.rpc("crm_start_conversation", {
    _phone: params.phone,
    _name: params.name ?? null,
    _patient: params.patientId ?? null,
    _connection: params.connectionId,
  } as any);
  if (error) throw error;
  return fetchConversationById(data as unknown as string);
}
