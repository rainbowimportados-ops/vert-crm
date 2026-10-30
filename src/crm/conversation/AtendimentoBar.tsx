import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { UserCheck, ArrowRightLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useUpdateConversation, useAssignableUsers } from "../services/atendimento";
import type { CrmConversation } from "../sdk/types";

const STATUSES: { key: string; label: string }[] = [
  { key: "novo", label: "Novo" },
  { key: "em_atendimento", label: "Em atendimento" },
  { key: "aguardando", label: "Aguardando" },
  { key: "finalizado", label: "Finalizado" },
];

export function AtendimentoBar({ conversation }: { conversation: CrmConversation }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { setStatus, assign } = useUpdateConversation();
  const { data: users } = useAssignableUsers();
  const [busy, setBusy] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [status, setStatusLocal] = useState(conversation.status);
  const [assigneeLabel, setAssigneeLabel] = useState<string | null>(conversation.assigneeName);
  useEffect(() => { setStatusLocal(conversation.status); setAssigneeLabel(conversation.assigneeName); }, [conversation.id, conversation.status, conversation.assigneeName]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); }
    catch (e: any) { toast({ title: "Erro", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); setShowTransfer(false); }
  };

  return (
    <div className="relative flex items-center gap-2 border-b border-border bg-card px-4 py-2">
      <select
        value={status}
        onChange={(e) => { const v = e.target.value; setStatusLocal(v); run(() => setStatus(conversation.id, v), "Status atualizado"); }}
        disabled={busy}
        className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary"
      >
        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>

      <div className="ml-auto flex items-center gap-1.5">
        {assigneeLabel && (
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Resp.: {assigneeLabel}</span>
        )}
        <button
          onClick={() => { setAssigneeLabel("Você"); run(() => assign(conversation.id, user?.id ?? null), "Você assumiu a conversa"); }}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Assumir
        </button>
        <button
          onClick={() => setShowTransfer((v) => !v)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir
        </button>
      </div>

      {showTransfer && (
        <div className="absolute right-4 top-11 z-20 max-h-64 w-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-elevation-lg">
          {(users ?? []).length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum usuário.</div>
          ) : (users ?? []).map((u) => (
            <button
              key={u.id}
              onClick={() => { setAssigneeLabel(u.name); run(() => assign(conversation.id, u.id), `Transferido para ${u.name}`); }}
              className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted")}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {u.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{u.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
