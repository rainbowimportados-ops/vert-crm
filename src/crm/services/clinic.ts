import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import { isDemoMode } from "./demo";

// Integração com os módulos da clínica (pacientes, agenda, procedimentos, orçamentos).
//
// No VERT CRM independente, essas tabelas NÃO fazem parte do banco do CRM: cada
// consulta só roda quando a integração correspondente está ligada no manifesto
// da instalação (crm_installations.manifest.integrations). Desligada, o CRM
// funciona normalmente, só sem os dados da clínica. Quando o banco de pacientes
// e agendamentos for conectado, a ligação acontece aqui.

export interface PatientInfo {
  id: string; name: string; cpf: string | null; phone: string | null;
  whatsapp: string | null; email: string | null; city: string | null;
  status: string | null; photo_url: string | null;
}

function useIntegracoes() {
  return useCrmContext().manifest.integrations;
}

export function usePatient(patientId: string | null) {
  const integ = useIntegracoes();
  return useQuery({
    queryKey: ["crm-patient", patientId],
    enabled: !isDemoMode() && !!integ.patients && !!patientId,
    staleTime: 60_000,
    queryFn: async (): Promise<PatientInfo | null> => {
      const { data } = await supabase
        .from("patients")
        .select("id, name, cpf, phone, whatsapp, email, city, status, photo_url")
        .eq("id", patientId).maybeSingle();
      return (data as PatientInfo) ?? null;
    },
  });
}

export function usePatientAppointments(patientId: string | null) {
  const integ = useIntegracoes();
  return useQuery({
    queryKey: ["crm-patient-appts", patientId],
    enabled: !isDemoMode() && !!integ.agenda && !!patientId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, status, procedure_text, procedure:procedures(name), doctor:doctors(name)")
        .eq("patient_id", patientId)
        .order("scheduled_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
}

export function usePatientBudgets(patientId: string | null) {
  const integ = useIntegracoes();
  return useQuery({
    queryKey: ["crm-patient-budgets", patientId],
    enabled: !isDemoMode() && !!integ.budgets && !!patientId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("budgets")
        .select("id, total_value, status, procedimento, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
}

export interface ProcedureLite { id: string; name: string; default_price: number | null; }

export function useProcedures() {
  const { organizationId, manifest } = useCrmContext();
  return useQuery({
    queryKey: ["crm-procedures", organizationId],
    enabled: !isDemoMode() && !!manifest.integrations.procedures && !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProcedureLite[]> => {
      const { data } = await supabase
        .from("procedures")
        .select("id, name, default_price")
        .eq("active", true)
        .order("name");
      return (data as ProcedureLite[]) ?? [];
    },
  });
}

export function useSchedulables() {
  const { organizationId, manifest } = useCrmContext();
  return useQuery({
    queryKey: ["crm-schedulables", organizationId],
    enabled: !isDemoMode() && !!manifest.integrations.agenda && !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [docs, rooms] = await Promise.all([
        supabase.from("doctors").select("id, name").eq("active", true).order("name"),
        supabase.from("rooms").select("id, name, city").eq("active", true).order("name"),
      ]);
      return { doctors: docs.data ?? [], rooms: rooms.data ?? [] };
    },
  });
}

/**
 * Cria um agendamento na Agenda existente. Se o contato ainda não é paciente,
 * converte (cria paciente + vincula ao contato/conversa) — conversão explícita pela ação do atendente.
 */
export async function scheduleFromConversation(params: {
  organizationId: string;
  contactId: string;
  patientId: string | null;
  contactName: string;
  contactPhone: string;
  doctorId: string;
  procedureId: string | null;
  roomId: string | null;
  scheduledAt: string; // ISO
}): Promise<{ patientId: string; appointmentId: string }> {
  let patientId = params.patientId;

  if (!patientId) {
    const { data: pat, error: pErr } = await supabase
      .from("patients")
      .insert({
        organization_id: params.organizationId,
        name: params.contactName || "Novo paciente",
        whatsapp: params.contactPhone || null,
        status: "ativo",
      })
      .select("id").single();
    if (pErr) throw pErr;
    patientId = pat.id;
    // vincula contato + leads dessa conversa
    await supabase.from("crm_contacts").update({ patient_id: patientId, is_lead: false }).eq("id", params.contactId);
  }

  const { data: appt, error: aErr } = await supabase
    .from("appointments")
    .insert({
      organization_id: params.organizationId,
      patient_id: patientId,
      doctor_id: params.doctorId || null,
      procedure_id: params.procedureId,
      room_id: params.roomId,
      scheduled_at: params.scheduledAt,
      status: "aguardando",
      kind: "consulta",
    })
    .select("id").single();
  if (aErr) throw aErr;

  return { patientId: patientId!, appointmentId: appt.id };
}
