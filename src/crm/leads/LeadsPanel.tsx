import { useMemo, useState } from "react";
import { CheckCircle2, Globe, Loader2, MessageSquare, TrendingUp, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLeadsList, useUpdateLeadStatus, type CrmLeadRow } from "../services/leads";
import { startConversation } from "../services/newConversation";
import { NewLeadDialog } from "./NewLeadDialog";
import { useCrmContext } from "../provider/CrmProvider";
import type { CrmConversation } from "../sdk/types";
import { displayName, maskPhone } from "../sdk/phone";
import { ETAPAS, ORIGENS, etapaDe, nomeDaOrigem, origemDe, type EtapaFunil, type OrigemLead } from "../sdk/funil";
import { CrmEmpty, CrmPageHeader, CrmStatCard } from "../ui/CrmUi";

const CORES: Record<EtapaFunil, string> = {
  novo: "bg-muted-foreground/40",
  em_atendimento: "bg-primary/60",
  aguardando: "bg-warning",
  finalizado: "bg-success",
  perdido: "bg-destructive/70",
};

function quando(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Funil de vendas: uma coluna por etapa, com origem do lead e atalho para a conversa. */
export function LeadsPanel({ onOpen }: { onOpen: (conversation: CrmConversation) => void }) {
  const { toast } = useToast();
  const { activeConnectionId } = useCrmContext();
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [origem, setOrigem] = useState<OrigemLead | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: leads, isLoading } = useLeadsList("all");
  const updateStatus = useUpdateLeadStatus();

  const rows = useMemo(() => (leads ?? []).filter((lead) => {
    const searchable = `${lead.contact?.name ?? ""} ${lead.contact?.phone ?? ""} ${lead.intent ?? ""}`.toLowerCase();
    return searchable.includes(search.toLowerCase()) && (!origem || origemDe(lead.source, true) === origem);
  }), [leads, search, origem]);

  const porEtapa = useMemo(() => {
    const out = Object.fromEntries(ETAPAS.map((e) => [e.key, [] as CrmLeadRow[]])) as Record<EtapaFunil, CrmLeadRow[]>;
    rows.forEach((lead) => out[etapaDe(lead.status)].push(lead));
    return out;
  }, [rows]);

  const counts = useMemo(() => {
    const all = leads ?? [];
    const ganhos = all.filter((l) => etapaDe(l.status) === "finalizado").length;
    const fechados = ganhos + all.filter((l) => etapaDe(l.status) === "perdido").length;
    return {
      total: all.length,
      novos: all.filter((l) => etapaDe(l.status) === "novo").length,
      site: all.filter((l) => (l.source ?? "").startsWith("site:")).length,
      ganhos,
      conversao: fechados ? Math.round((ganhos / fechados) * 100) : null,
    };
  }, [leads]);

  const origemCounts = useMemo(() => {
    const out = Object.fromEntries(ORIGENS.map((o) => [o.key, 0])) as Record<OrigemLead, number>;
    (leads ?? []).forEach((l) => { out[origemDe(l.source, true)] += 1; });
    return out;
  }, [leads]);

  const open = async (lead: CrmLeadRow) => {
    if (!lead.contact?.phone) {
      toast({ title: "Lead sem telefone", variant: "destructive" });
      return;
    }
    setBusyId(lead.id);
    try {
      if (!activeConnectionId) throw new Error("Nenhum WhatsApp liberado.");
      const conversation = await startConversation({
        phone: lead.contact.phone,
        name: lead.contact.name ?? undefined,
        patientId: lead.contact.patient_id ?? undefined,
        connectionId: activeConnectionId,
      });
      if (conversation) onOpen(conversation);
    } catch (error: unknown) {
      toast({ title: "Erro ao abrir conversa", description: error instanceof Error ? error.message : "Não foi possível abrir a conversa.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const mover = async (lead: CrmLeadRow, etapa: EtapaFunil) => {
    setBusyId(lead.id);
    try {
      await updateStatus(lead.id, etapa);
    } catch (error: unknown) {
      toast({ title: "Não foi possível mudar a etapa", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full space-y-6 p-5 lg:p-8">
      <CrmPageHeader title="Funil de vendas" search={search} onSearch={setSearch} placeholder="Buscar leads..." onFilter={() => setFiltersOpen((v) => !v)} primaryLabel="Novo Lead" onPrimary={() => setNewOpen(true)} />
      <NewLeadDialog open={newOpen} onClose={() => setNewOpen(false)} />

      {(filtersOpen || origem) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Origem:</span>
          <button onClick={() => setOrigem(null)} className={cn("rounded-full border px-3 py-1.5 text-xs", !origem ? "border-primary bg-accent text-primary-dark" : "border-border bg-white text-muted-foreground")}>Todas</button>
          {ORIGENS.map((o) => (
            <button key={o.key} onClick={() => setOrigem(origem === o.key ? null : o.key)} className={cn("rounded-full border px-3 py-1.5 text-xs", origem === o.key ? "border-primary bg-accent text-primary-dark" : "border-border bg-white text-muted-foreground")}>
              {o.label} <span className="tabular-nums opacity-60">{origemCounts[o.key]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmStatCard icon={Users} label="Leads no funil" value={counts.total} />
        <CrmStatCard icon={UserPlus} label="Novos (sem contato)" value={counts.novos} />
        <CrmStatCard icon={Globe} label="Vieram do site" value={counts.site} />
        <CrmStatCard icon={CheckCircle2} label={counts.conversao === null ? "Ganhos" : `Ganhos · ${counts.conversao}% de conversão`} value={counts.ganhos} />
      </div>

      {isLoading ? (
        <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : (leads ?? []).length === 0 ? (
        <div className="rounded-xl border border-border bg-white"><CrmEmpty title="Nenhum lead ainda" description="Os leads da landing page e do cartão digital aparecem aqui sozinhos. Você também pode cadastrar um novo lead." /></div>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-2 lg:-mx-8 lg:px-8">
          <div className="grid min-w-[1100px] grid-cols-5 gap-3">
            {ETAPAS.map((etapa) => (
              <section key={etapa.key} className="flex min-h-[320px] flex-col rounded-xl border border-border bg-muted/40">
                <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", CORES[etapa.key])} />
                  <h2 className="text-sm font-semibold">{etapa.label}</h2>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">{porEtapa[etapa.key].length}</span>
                </header>
                <div className="flex max-h-[60vh] flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {porEtapa[etapa.key].length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhum lead</p>
                  ) : porEtapa[etapa.key].map((lead) => {
                    const origemLead = origemDe(lead.source, true);
                    const busy = busyId === lead.id;
                    return (
                      <article key={lead.id} className="rounded-lg border border-border bg-white p-3 shadow-sm">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <strong className="block truncate text-sm font-medium">{lead.contact ? displayName(lead.contact.name, lead.contact.phone) : "Lead"}</strong>
                            <span className="block truncate text-xs text-muted-foreground">{maskPhone(lead.contact?.phone ?? "") || "Sem telefone"}</span>
                          </div>
                          <button onClick={() => void open(lead)} disabled={busy} title="Abrir conversa" className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-primary hover:bg-accent disabled:opacity-60">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", origemLead === "landing" || origemLead === "digital_card" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                            <Globe className="h-2.5 w-2.5" />{origemLead === "manual" && lead.source ? lead.source : nomeDaOrigem(origemLead)}
                          </span>
                          {lead.intent && <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{lead.intent}</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{quando(lead.created_at)}</span>
                          <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                            <TrendingUp className="h-3 w-3" />
                            <select
                              value={etapaDe(lead.status)}
                              onChange={(e) => void mover(lead, e.target.value as EtapaFunil)}
                              disabled={busy}
                              aria-label="Mover para a etapa"
                              className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-primary"
                            >
                              {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                            </select>
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
