import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Zap, Plus, Pencil, Trash2, Loader2, RefreshCw, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import { useQuickReplies, useQuickReplyActions, type QuickReply } from "../services/quickReplies";

/** Respostas rápidas com atalho "/" — usadas pelo compositor da conversa. */
export function QuickRepliesSettings() {
  const { role } = useCrmContext();
  const { toast } = useToast();
  const canManage = ["admin", "super_admin", "gestor"].includes(role);
  const { data: replies } = useQuickReplies();
  const { save, remove } = useQuickReplyActions();

  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const syncWithWhatsapp = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke(
      "crm-whatsapp-settings",
      { body: { action: "quick_replies" } },
    );
    setSyncing(false);
    if (error || !data?.ok) {
      toast({
        title: "Não foi possível sincronizar",
        description: error?.message || data?.message || "Confira a conexão do WhatsApp.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Respostas rápidas sincronizadas",
      description: `${data.synced ?? 0} respostas disponíveis em todas as conversas do WhatsApp no CRM.`,
    });
  };

  const submit = async () => {
    if (!editing?.title?.trim() || !editing?.body?.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await save(editing as QuickReply);
      setEditing(null);
      toast({ title: "Resposta rápida salva" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="w-full max-w-4xl space-y-4 px-5 py-5 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Zap className="h-5 w-5 text-primary" /> Respostas rápidas
          </h2>
          <p className="text-sm text-muted-foreground">
            Na conversa, digite <code className="rounded bg-muted px-1">/</code> ou clique no raio para usar. Variáveis: {"{nome_cliente}"} e {"{nome_atendente}"}.
          </p>
        </div>
        {canManage && !editing && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void syncWithWhatsapp()} disabled={syncing}
              className="inline-flex h-11 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground disabled:opacity-60">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizar WhatsApp
            </button>
            <button onClick={() => setEditing({ title: "", body: "", shortcut: "", category: "" })}
              className="inline-flex h-11 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-elevation-sm">
              <Plus className="h-4 w-4" /> Nova resposta
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className="space-y-2.5 rounded-xl border border-primary/40 bg-card p-5 shadow-elevation-sm">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-foreground">Título *</label>
              <input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Ex.: Saudação inicial"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Atalho</label>
              <input value={editing.shortcut ?? ""} onChange={(e) => setEditing({ ...editing, shortcut: e.target.value })}
                placeholder="/ola"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Categoria</label>
            <input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              placeholder="Ex.: Saudação, Valores, Agendamento…"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Mensagem *</label>
            <textarea value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              rows={4} placeholder={"Olá {nome_cliente}! 👋\nMeu nome é {nome_atendente}, como posso te ajudar?"}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => void submit()} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </button>
            <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted">
              <X className="h-4 w-4" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {(replies ?? []).length === 0 && !editing ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma resposta rápida ainda.</p>
          <p className="mt-1 text-xs text-muted-foreground">Crie atalhos como /ola, /valores e /horario para agilizar o atendimento.</p>
        </div>
      ) : (
        <div className="card-premium divide-y divide-border overflow-hidden">
          {(replies ?? []).map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.shortcut && <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">{r.shortcut}</code>}
                  <span className="text-sm font-medium text-foreground">{r.title}</span>
                  {r.category && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.category}</span>}
                  {r.uses > 0 && <span className="text-[10px] text-muted-foreground">{r.uses} usos</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{r.body}</p>
              </div>
              {canManage && (
                <div className="flex flex-shrink-0 gap-1">
                  <button onClick={() => setEditing(r)} title="Editar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { void remove(r.id).then(() => toast({ title: "Resposta removida" })).catch((e) => toast({ title: "Erro", description: e?.message, variant: "destructive" })); }}
                    title="Excluir" className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
