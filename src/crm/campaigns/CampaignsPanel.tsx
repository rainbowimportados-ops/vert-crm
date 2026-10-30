import { useMemo, useState } from "react";
import { CheckCheck, Eye, Loader2, MessageSquare, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCampaigns, useCampaignActions } from "../services/campaigns";
import { useTags } from "../services/atendimento";
import { CrmEmpty, CrmPageHeader, CrmStatCard, CrmStatus, CrmTableFooter } from "../ui/CrmUi";

export function CampaignsPanel() {
  const { toast } = useToast();
  const { data: campaigns } = useCampaigns();
  const { data: tags } = useTags();
  const { create, dispatch } = useCampaignActions();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("");
  const [tagId, setTagId] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const rows = useMemo(() => (campaigns ?? []).filter((campaign) => {
    const matchesSearch = `${campaign.name} ${campaign.message_template}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [campaigns, query, statusFilter]);

  const total = (campaigns ?? []).reduce((sum, campaign) => sum + (campaign.recipients ?? 0), 0);

  const save = async () => {
    if (!name.trim() || !template.trim()) {
      toast({ title: "Preencha nome e mensagem", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await create(name.trim(), template.trim(), tagId || undefined);
      setName("");
      setTemplate("");
      setTagId("");
      setForm(false);
      toast({ title: "Campanha criada" });
    } catch (error: unknown) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Não foi possível criar a campanha.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const send = async (id: string) => {
    setSending(id);
    try {
      const result = await dispatch(id);
      toast({ title: "Campanha disparada", description: `${result?.queued ?? 0} mensagens na fila.` });
    } catch (error: unknown) {
      toast({ title: "Erro ao disparar", description: error instanceof Error ? error.message : "Não foi possível disparar a campanha.", variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="w-full space-y-6 p-5 lg:p-8">
      <CrmPageHeader title="Campanhas" subtitle="Crie e gerencie campanhas de WhatsApp" search={query} onSearch={setQuery} placeholder="Buscar campanha..." onFilter={() => setFiltersOpen((open) => !open)} primaryLabel="Nova Campanha" onPrimary={() => setForm((open) => !open)} />

      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Status:</span>
          {[["all", "Todas"], ["rascunho", "Rascunho"], ["enviando", "Enviando"], ["concluida", "Concluída"], ["pausada", "Pausada"], ["cancelada", "Cancelada"]].map(([value, label]) => (
            <button key={value} onClick={() => setStatusFilter(value)} className={cn("rounded-full border px-3 py-1.5 text-xs", statusFilter === value ? "border-primary bg-accent text-primary-dark" : "border-border bg-white text-muted-foreground")}>{label}</button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><CrmStatCard icon={Send} label="Enviadas" value={total} /><CrmStatCard icon={CheckCheck} label="Entregues" value="—" /><CrmStatCard icon={Eye} label="Lidas" value="—" /><CrmStatCard icon={MessageSquare} label="Respostas" value="—" /></div>

      {form && (
        <div className="grid gap-3 rounded-xl border border-border bg-background p-5 lg:grid-cols-[1fr_1.4fr_.8fr_auto]">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da campanha" className="h-11 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary" />
          <input value={template} onChange={(event) => setTemplate(event.target.value)} placeholder="Mensagem — use {nome} para personalizar" className="h-11 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary" />
          <select value={tagId} onChange={(event) => setTagId(event.target.value)} className="h-11 rounded-lg border border-border bg-white px-3 text-sm"><option value="">Todos os contatos</option>{(tags ?? []).map((tag: { id: string; label: string }) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}</select>
          <button onClick={() => void save()} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm text-white disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Criar</button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="hidden grid-cols-[1.5fr_.75fr_1fr_1fr_.7fr_.7fr_.7fr_.7fr_.9fr_.35fr] border-b border-accent px-5 py-4 text-xs font-medium xl:grid"><span>Campanha</span><span>Status</span><span>Público</span><span>Unidade</span><span>Enviadas</span><span>Entregues</span><span>Lidas</span><span>Respostas</span><span>Data</span><span>Ações</span></div>
        {rows.length === 0 ? <CrmEmpty title="Nenhuma campanha encontrada" description="Ajuste os filtros ou crie sua primeira campanha." /> : rows.map((campaign) => (
          <div key={campaign.id} className="grid gap-3 border-b border-accent px-5 py-4 last:border-b-0 xl:grid-cols-[1.5fr_.75fr_1fr_1fr_.7fr_.7fr_.7fr_.7fr_.9fr_.35fr] xl:items-center">
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-primary"><Sparkles className="h-5 w-5" /></span><span className="min-w-0"><strong className="block truncate text-sm">{campaign.name}</strong><small className="block truncate text-[11px] text-muted-foreground">{campaign.message_template}</small></span></div>
            <CrmStatus tone={campaign.status === "concluida" ? "green" : campaign.status === "enviando" ? "amber" : "neutral"}>{campaign.status}</CrmStatus><span className="text-sm">{campaign.filters?.tagId ? "Segmentado" : "Todos os contatos"}</span><span className="text-sm">Todas</span><span className="text-sm">{campaign.recipients ?? 0}</span><span className="text-sm">—</span><span className="text-sm">—</span><span className="text-sm">—</span><span className="text-xs">{new Date(campaign.created_at).toLocaleDateString("pt-BR")}<small className="block">{new Date(campaign.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small></span>
            <button onClick={() => void send(campaign.id)} disabled={sending === campaign.id || campaign.status === "enviando"} title="Disparar campanha" className="flex h-8 w-8 items-center justify-center rounded-md text-primary-dark hover:bg-accent disabled:opacity-50">{sending === campaign.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
          </div>
        ))}
        <CrmTableFooter text={`Mostrando ${rows.length} de ${(campaigns ?? []).length} campanhas`} />
      </div>
    </div>
  );
}
