import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Check,
  Copy,
  DollarSign,
  Eye,
  Loader2,
  MessageSquare,
  MoreVertical,
  Pencil,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useContactsList, useContactsCount, useContactsKpis, useRenameContact } from "../services/contacts";
import { startConversation } from "../services/newConversation";
import { useCrmContext } from "../provider/CrmProvider";
import type { CrmConversation } from "../sdk/types";
import { displayName, maskPhone } from "../sdk/phone";
import { CrmEmpty, CrmPageHeader, CrmStatCard, CrmStatus, CrmTableFooter } from "../ui/CrmUi";

type PhoneFilter = "all" | "withPhone" | "withoutPhone";

export function ContactsPanel({ onOpen }: { onOpen: (conversation: CrmConversation) => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeConnectionId } = useCrmContext();
  const renameContact = useRenameContact();
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const { data: contacts, isLoading } = useContactsList(search);
  const { data: total } = useContactsCount();
  const { data: kpis } = useContactsKpis();

  const patients = useMemo(() => (contacts ?? []).filter((contact) => {
    if (!contact.patient_id) return false;
    if (phoneFilter === "withPhone") return !!contact.phone;
    if (phoneFilter === "withoutPhone") return !contact.phone;
    return true;
  }), [contacts, phoneFilter]);

  const openConversation = async (contact: (typeof patients)[number]) => {
    if (!contact.phone) {
      toast({ title: "Contato sem telefone", variant: "destructive" });
      return;
    }
    setBusyId(contact.id);
    try {
      const conversation = await startConversation({ phone: contact.phone, name: contact.name, patientId: contact.patient_id });
      if (conversation) onOpen(conversation);
    } catch (error: unknown) {
      toast({
        title: "Erro ao abrir conversa",
        description: error instanceof Error ? error.message : "Não foi possível abrir a conversa.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
      setActionId(null);
    }
  };

  const saveName = async (contactId: string) => {
    setBusyId(contactId);
    try {
      await renameContact(contactId, draftName);
      toast({ title: "Nome atualizado" });
      setEditingId(null);
    } catch (error: unknown) {
      toast({
        title: "Erro ao renomear",
        description: error instanceof Error ? error.message : "Não foi possível atualizar o contato.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const copyPhone = async (phone: string | null) => {
    if (!phone) return;
    await navigator.clipboard.writeText(phone);
    toast({ title: "Telefone copiado" });
    setActionId(null);
  };

  return (
    <div className="w-full space-y-6 p-5 lg:p-8">
      <CrmPageHeader
        title="Pacientes"
        subtitle="Gerencie os pacientes da clínica"
        search={search}
        onSearch={setSearch}
        placeholder="Buscar paciente..."
        onFilter={() => setFiltersOpen((open) => !open)}
        primaryLabel="Novo Paciente"
        onPrimary={() => navigate("/pacientes")}
      />

      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Telefone:</span>
          {([
            ["all", "Todos"],
            ["withPhone", "Com WhatsApp"],
            ["withoutPhone", "Sem telefone"],
          ] as const).map(([value, label]) => (
            <button key={value} onClick={() => setPhoneFilter(value)} className={cn("rounded-full border px-3 py-1.5 text-xs", phoneFilter === value ? "border-primary bg-accent text-primary-dark" : "border-border bg-white text-muted-foreground")}>{label}</button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmStatCard icon={Users} label="Total de Pacientes" value={kpis?.pacientes ?? patients.length} helper="Todos os pacientes cadastrados" />
        <CrmStatCard icon={UserRound} label="Pacientes Ativos" value={kpis?.pacientes ?? patients.length} helper="Pacientes vinculados ao CRM" />
        <CrmStatCard icon={UserPlus} label="Novos este mês" value={kpis?.novosNoMes ?? 0} helper="Pacientes cadastrados no mês" />
        <CrmStatCard icon={DollarSign} label="Ticket Médio" value="—" helper="Calculado pelos orçamentos do Vert Control" />
      </div>

      <div className="overflow-visible rounded-xl border border-border bg-white">
        <div className="hidden grid-cols-[1.45fr_1fr_1fr_.8fr_1fr_1fr_.75fr_.65fr] border-b border-accent px-5 py-4 text-xs font-medium text-card-foreground xl:grid">
          <span>Paciente</span><span>WhatsApp</span><span>Unidade</span><span>Vínculo</span><span>Próxima consulta</span><span>Último procedimento</span><span>Status</span><span>Ações</span>
        </div>
        {isLoading ? (
          <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : patients.length === 0 ? (
          <CrmEmpty title="Nenhum paciente encontrado" description="Pacientes vinculados ao cadastro único do Vert Control aparecerão aqui." />
        ) : patients.map((contact) => (
          <div key={contact.id} className="grid gap-3 border-b border-accent px-5 py-3.5 last:border-b-0 xl:grid-cols-[1.45fr_1fr_1fr_.8fr_1fr_1fr_.75fr_.65fr] xl:items-center">
            <div className="flex min-w-0 items-center gap-3">
              {contact.avatar_url ? <img src={contact.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" decoding="async" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-primary"><UserRound className="h-5 w-5" /></span>}
              {editingId === contact.id ? (
                <span className="flex min-w-0 items-center gap-1">
                  <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveName(contact.id); if (event.key === "Escape") setEditingId(null); }} className="h-8 min-w-0 rounded-md border border-border px-2 text-sm" />
                  <button onClick={() => void saveName(contact.id)} disabled={busyId === contact.id} title="Salvar"><Check className="h-4 w-4 text-success" /></button>
                  <button onClick={() => setEditingId(null)} title="Cancelar"><X className="h-4 w-4 text-primary-dark" /></button>
                </span>
              ) : (
                <span className="min-w-0"><strong className="block truncate text-sm font-medium">{displayName(contact.name, contact.phone)}</strong><small className="block truncate text-[11px] text-muted-foreground">Cadastro integrado</small></span>
              )}
            </div>
            <span className="text-sm text-sidebar-foreground">{maskPhone(contact.phone ?? "") || "—"}</span>
            <span className="text-sm text-sidebar-foreground">{contact.city || "—"}</span>
            <span className="text-sm text-sidebar-foreground">Paciente</span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4 text-primary" />—</span>
            <span className="text-sm text-muted-foreground">—</span>
            <CrmStatus tone="green">Ativo</CrmStatus>
            <span className="relative flex gap-2">
              <button onClick={() => void openConversation(contact)} disabled={busyId === contact.id} title="Abrir conversa" className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-white disabled:opacity-60">{busyId === contact.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</button>
              <button onClick={() => void openConversation(contact)} title="Conversar" className="flex h-8 w-8 items-center justify-center rounded-md border border-border"><MessageSquare className="h-4 w-4" /></button>
              <button onClick={() => setActionId((current) => current === contact.id ? null : contact.id)} title="Mais ações" className="flex h-8 w-8 items-center justify-center rounded-md border border-border"><MoreVertical className="h-4 w-4" /></button>
              {actionId === contact.id && (
                <span className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-border bg-white p-1.5 shadow-lg">
                  <button onClick={() => { setDraftName(contact.name ?? ""); setEditingId(contact.id); setActionId(null); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted"><Pencil className="h-3.5 w-3.5" />Renomear</button>
                  <button onClick={() => void copyPhone(contact.phone)} disabled={!contact.phone} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted disabled:opacity-40"><Copy className="h-3.5 w-3.5" />Copiar telefone</button>
                </span>
              )}
            </span>
          </div>
        ))}
        <CrmTableFooter text={`Mostrando ${patients.length} de ${total ?? patients.length} pacientes`} />
      </div>
    </div>
  );
}
