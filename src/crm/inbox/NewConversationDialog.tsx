import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Search, Loader2, UserRound, UserPlus, Phone, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCrmContext } from "../provider/CrmProvider";
import { searchContactsAndPatients, startConversation, type ContactHit } from "../services/newConversation";
import type { CrmConversation } from "../sdk/types";
import { onlyDigits, maskPhone, displayName } from "../sdk/phone";

type Mode = "search" | "new";

export function NewConversationDialog({ open, onClose, onStarted, defaultConnectionId }: {
  open: boolean;
  onClose: () => void;
  onStarted: (c: CrmConversation) => void;
  defaultConnectionId?: string | null;
}) {
  const { organizationId, activeConnectionId, activeConnection, manifest } = useCrmContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("search");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // aba "novo contato"
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    if (!open) {
      setMode("search"); setTerm(""); setDebounced(""); setNewName(""); setNewPhone("");
      return;
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  const { data: hits, isFetching } = useQuery({
    queryKey: ["crm-contact-search", organizationId, activeConnectionId, debounced, !!manifest.integrations.patients],
    queryFn: () => searchContactsAndPatients(organizationId, debounced, activeConnectionId!, !!manifest.integrations.patients),
    enabled: open && mode === "search" && !!organizationId && !!activeConnectionId && debounced.trim().length >= 2,
    staleTime: 10_000,
  });

  const rawDigits = onlyDigits(term);
  const rawPhoneOption = useMemo(() => {
    if (rawDigits.length < 10) return null; // parece um telefone válido (DDD + número)
    const already = (hits ?? []).some((h) => onlyDigits(h.phone) === rawDigits);
    return already ? null : rawDigits;
  }, [rawDigits, hits]);

  const begin = async (phone: string, name: string | null, patientId: string | null, key: string) => {
    if (!phone || onlyDigits(phone).length < 10) {
      toast({ title: "Telefone inválido", description: "Informe DDD + número.", variant: "destructive" });
      return;
    }
    setBusyId(key);
    try {
      const connectionId = defaultConnectionId || activeConnectionId;
      if (!connectionId) throw new Error("Nenhum painel de WhatsApp liberado.");
      const conv = await startConversation({ phone: onlyDigits(phone), name, patientId, connectionId });
      qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId] });
      if (conv) { onStarted(conv); onClose(); }
      else toast({ title: "Conversa criada", description: "Atualize a caixa de entrada." });
    } catch (e: any) {
      toast({ title: "Erro ao iniciar conversa", description: e?.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const newPhoneDigits = onlyDigits(newPhone);
  const canCreate = newName.trim().length >= 2 && newPhoneDigits.length >= 10;

  if (!open) return null;

  const tab = (key: Mode, label: string) => (
    <button
      key={key}
      onClick={() => setMode(key)}
      className={cn(
        "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        mode === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 p-4 pt-[10vh]" onClick={onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MessageSquarePlus className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Nova conversa</h2>
          <button onClick={onClose} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pt-3">
          {activeConnection && (
            <div className="mb-3 rounded-xl border border-border bg-background px-3 py-2">
              <span className="block text-[11px] font-medium text-muted-foreground">Enviar pelo painel</span>
              <strong className="mt-0.5 block text-sm text-foreground">{activeConnection.displayName}</strong>
              {activeConnection.phoneNumber && <small className="block text-xs text-muted-foreground">{activeConnection.phoneNumber}</small>}
            </div>
          )}
          <div className="flex rounded-xl bg-muted p-0.5">
            {tab("search", "Buscar contato")}
            {tab("new", "Novo contato")}
          </div>
        </div>

        {mode === "search" ? (
          <>
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                {isFetching
                  ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  : null}
                <input
                  autoFocus
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Buscar por nome ou telefone…"
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="max-h-[50vh] min-h-[120px] overflow-y-auto p-2">
              {debounced.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Digite um nome ou número para buscar.</p>
              ) : (
                <>
                  {(hits ?? []).map((h: ContactHit) => (
                    <button
                      key={`${h.kind}-${h.id}`}
                      onClick={() => begin(h.phone, h.name, h.patientId, `${h.kind}-${h.id}`)}
                      disabled={!!busyId}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted disabled:opacity-60"
                    >
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${h.patientId ? "bg-success/15 text-success" : "bg-primary/10 text-primary"}`}>
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{displayName(h.name, h.phone)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{maskPhone(h.phone ?? "") || "sem telefone"}{h.patientId ? " · paciente" : ""}</span>
                      </span>
                      {busyId === `${h.kind}-${h.id}` ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                    </button>
                  ))}

                  {rawPhoneOption && (
                    <button
                      onClick={() => begin(rawPhoneOption, null, null, "raw")}
                      disabled={!!busyId}
                      className="mt-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2 text-left hover:bg-muted disabled:opacity-60"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Phone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">Iniciar com o número {maskPhone(rawPhoneOption)}</span>
                        <span className="block text-xs text-muted-foreground">Cria um novo contato</span>
                      </span>
                      {busyId === "raw" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <UserPlus className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  )}

                  {!isFetching && (hits ?? []).length === 0 && !rawPhoneOption && (
                    <div className="px-3 py-6 text-center">
                      <p className="text-xs text-muted-foreground">Nada encontrado.</p>
                      <button
                        onClick={() => {
                          const d = onlyDigits(term);
                          if (d) setNewPhone(maskPhone(d)); else setNewName(term.trim());
                          setMode("new");
                        }}
                        className="mt-1 text-xs font-medium text-primary hover:underline"
                      >
                        Cadastrar um novo contato
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Maria Silva"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Telefone (com DDD)</label>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(maskPhone(e.target.value))}
                onKeyDown={(e) => { if (e.key === "Enter" && canCreate && !busyId) begin(newPhoneDigits, newName.trim(), null, "new"); }}
                inputMode="numeric"
                placeholder="(11) 91234-5678"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {newPhone && newPhoneDigits.length < 10 && (
                <p className="mt-1 text-[11px] text-destructive">Informe DDD + número.</p>
              )}
            </div>
            <button
              onClick={() => begin(newPhoneDigits, newName.trim(), null, "new")}
              disabled={!canCreate || !!busyId}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busyId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Cadastrar e iniciar conversa
            </button>
            <p className="text-[11px] text-muted-foreground">
              O contato é criado no CRM e a conversa abre em seguida. Se o número já existir, a conversa existente é reaproveitada.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
