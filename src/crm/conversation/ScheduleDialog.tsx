import { useState } from "react";
import { X, Loader2, CalendarPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCrmContext } from "../provider/CrmProvider";
import { useProcedures, useSchedulables, scheduleFromConversation } from "../services/clinic";
import type { CrmConversation } from "../sdk/types";
import { displayName } from "../sdk/phone";

interface Props {
  conversation: CrmConversation;
  onClose: () => void;
  onScheduled: () => void;
}

export function ScheduleDialog({ conversation, onClose, onScheduled }: Props) {
  const { organizationId } = useCrmContext();
  const { toast } = useToast();
  const { data: procedures } = useProcedures();
  const { data: sched } = useSchedulables();

  const [doctorId, setDoctorId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!date) { toast({ title: "Informe a data", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const scheduledAt = new Date(`${date}T${time || "09:00"}:00`).toISOString();
      const res = await scheduleFromConversation({
        organizationId,
        contactId: conversation.contact.id,
        patientId: conversation.contact.patientId,
        contactName: displayName(conversation.contact.name, conversation.contact.phone),
        contactPhone: conversation.contact.phone,
        doctorId,
        procedureId: procedureId || null,
        roomId: roomId || null,
        scheduledAt,
      });
      toast({
        title: "Agendamento criado",
        description: conversation.contact.patientId ? "Adicionado à Agenda." : "Lead convertido em paciente e agendado.",
      });
      onScheduled();
      onClose();
      void res;
    } catch (e: any) {
      toast({ title: "Erro ao agendar", description: e?.message ?? "Falha", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-elevation-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarPlus className="h-4 w-4 text-primary" /> Agendar — {displayName(conversation.contact.name, conversation.contact.phone)}
          </h3>
          <button onClick={onClose} className="rounded-xl p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>

        {!conversation.contact.patientId && (
          <p className="mb-3 rounded-xl bg-primary/10 px-3 py-2 text-[11px] text-primary">
            Este contato ainda não é paciente — ao agendar, ele será convertido em paciente e vinculado.
          </p>
        )}

        <div className="space-y-3">
          <Field label="Doutor">
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="select">
              <option value="">Selecionar…</option>
              {sched?.doctors.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Procedimento">
            <select value={procedureId} onChange={(e) => setProcedureId(e.target.value)} className="select">
              <option value="">Selecionar…</option>
              {procedures?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="select" /></Field>
            <Field label="Hora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="select" /></Field>
          </div>
          {sched?.rooms?.length ? (
            <Field label="Sala">
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="select">
                <option value="">Selecionar…</option>
                {sched.rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}{r.city ? ` · ${r.city}` : ""}</option>)}
              </select>
            </Field>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Agendar
          </button>
        </div>
      </div>
      <style>{`.select{width:100%;border:1px solid hsl(var(--border));background:hsl(var(--background));border-radius:.6rem;padding:.5rem .75rem;font-size:.875rem;outline:none}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
