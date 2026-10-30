import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, Phone, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLeadsList } from "../services/leads";
import { startConversation } from "../services/newConversation";
import { useCrmContext } from "../provider/CrmProvider";
import { NewLeadDialog } from "./NewLeadDialog";
import type { CrmConversation } from "../sdk/types";
import { displayName, maskPhone } from "../sdk/phone";
import { CrmEmpty, CrmPageHeader, CrmStatCard, CrmStatus, CrmTableFooter } from "../ui/CrmUi";

const tone = (status: string | null): "neutral" | "blue" | "amber" | "green" => status === "em_atendimento" ? "blue" : status === "aguardando" ? "amber" : status === "finalizado" ? "green" : "neutral";
const label = (status: string | null) => ({ novo: "Novo", em_atendimento: "Em Contato", aguardando: "Aguardando", finalizado: "Convertido" } as Record<string, string>)[status ?? ""] ?? status ?? "Novo";

export function LeadsPanel({ onOpen }: { onOpen: (conversation: CrmConversation) => void }) {
  const { toast } = useToast();
  const { activeConnectionId } = useCrmContext();
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: leads, isLoading } = useLeadsList("all");

  const rows = useMemo(() => (leads ?? []).filter((lead) => {
    const searchable = `${lead.contact?.name ?? ""} ${lead.contact?.phone ?? ""} ${lead.procedure?.name ?? ""}`.toLowerCase();
    const matchesSearch = searchable.includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [leads, search, statusFilter]);

  const counts = useMemo(() => ({
    total: (leads ?? []).length,
    new: (leads ?? []).filter((lead) => lead.status === "novo").length,
    contact: (leads ?? []).filter((lead) => lead.status === "em_atendimento" || lead.status === "aguardando").length,
    done: (leads ?? []).filter((lead) => lead.status === "finalizado").length,
  }), [leads]);

  const open = async (lead: (typeof rows)[number]) => {
    if (!lead.contact?.phone) {
      toast({ title: "Lead sem telefone", variant: "destructive" });
      return;
    }
    setBusyId(lead.id);
    try {
      const conversation = await startConversation({ phone: lead.contact.phone, name: lead.contact.name, patientId: lead.contact.patient_id });
      if (conversation) onOpen(conversation);
    } catch (error: unknown) {
      toast({ title: "Erro ao abrir conversa", description: error instanceof Error ? error.message : "Não foi possível abrir a conversa.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full space-y-6 p-5 lg:p-8">
      <CrmPageHeader title="Leads" search={search} onSearch={setSearch} placeholder="Buscar leads..." onFilter={() => setFiltersOpen((open) => !open)} primaryLabel="Novo Lead" onPrimary={() => setNewOpen(true)} />
      <NewLeadDialog open={newOpen} onClose={() => setNewOpen(false)} />

      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Status:</span>
          {[["all", "Todos"], ["novo", "Novos"], ["em_atendimento", "Em contato"], ["aguardando", "Aguardando"], ["finalizado", "Convertidos"]].map(([value, text]) => (
            <button key={value} onClick={() => setStatusFilter(value)} className={cn("rounded-full border px-3 py-1.5 text-xs", statusFilter === value ? "border-primary bg-accent text-primary-dark" : "border-border bg-white text-muted-foreground")}>{text}</button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmStatCard icon={Users} label="Total de Leads" value={counts.total} />
        <CrmStatCard icon={UserPlus} label="Novos Leads" value={counts.new} />
        <CrmStatCard icon={Phone} label="Em Contato" value={counts.contact} />
        <CrmStatCard icon={CheckCircle2} label="Convertidos" value={counts.done} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="hidden grid-cols-[1.5fr_1fr_1fr_.8fr_.8fr_.9fr_1fr_.8fr_.35fr] border-b border-accent px-5 py-4 text-xs font-medium xl:grid"><span>Lead</span><span>WhatsApp</span><span>Procedimento de Interesse</span><span>Origem</span><span>Unidade</span><span>Status</span><span>Responsável</span><span>Criado em</span><span>Ações</span></div>
        {isLoading ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : rows.length === 0 ? <CrmEmpty title="Nenhum lead encontrado" description="Ajuste a busca ou os filtros, ou cadastre um novo lead." /> : rows.map((lead) => (
          <div key={lead.id} className="grid gap-3 border-b border-accent px-5 py-3.5 last:border-b-0 xl:grid-cols-[1.5fr_1fr_1fr_.8fr_.8fr_.9fr_1fr_.8fr_.35fr] xl:items-center">
            <div className="min-w-0"><strong className="block truncate text-sm font-medium">{lead.contact ? displayName(lead.contact.name, lead.contact.phone) : "Lead"}</strong><small className="block truncate text-[11px] text-muted-foreground">Interesse registrado no CRM</small></div>
            <span className="text-sm text-sidebar-foreground">{maskPhone(lead.contact?.phone ?? "") || "—"}</span><span className="text-sm text-sidebar-foreground">{lead.procedure?.name || "—"}</span><span className="text-sm text-sidebar-foreground">{lead.source || "—"}</span><span className="text-sm text-sidebar-foreground">—</span><CrmStatus tone={tone(lead.status)}>{label(lead.status)}</CrmStatus><span className="text-sm text-sidebar-foreground">Equipe VERT</span><span className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString("pt-BR")}<small className="block">{new Date(lead.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></span>
            <button onClick={() => void open(lead)} disabled={busyId === lead.id} title="Abrir conversa" className="flex h-8 w-8 items-center justify-center rounded-md text-accent-foreground hover:bg-accent disabled:opacity-60">{busyId === lead.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}</button>
          </div>
        ))}
        <CrmTableFooter text={`Mostrando ${rows.length} de ${counts.total} leads`} />
      </div>
    </div>
  );
}
