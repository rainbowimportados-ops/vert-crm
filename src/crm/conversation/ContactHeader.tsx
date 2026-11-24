import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, MapPin, Pencil, Check, X, Loader2, Bot } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRenameContact } from "../services/contacts";
import { useUpdateConversation } from "../services/atendimento";
import type { CrmConversation } from "../sdk/types";
import { displayName, initialsOf, isUsableName, maskPhone } from "../sdk/phone";

interface Props {
  conversation: CrmConversation;
  onBack?: () => void;
  /** Botões redondos do lado direito (etiquetas, dados, agenda). */
  actions?: ReactNode;
  /** Último botão da fila, depois do agente de IA (o menu "mais"). */
  menu?: ReactNode;
}

export function ContactHeader({ conversation: c, onBack, actions, menu }: Props) {
  const { toast } = useToast();
  const rename = useRenameContact();
  const { setAiMode } = useUpdateConversation();
  const [aiMode, setAiModeLocal] = useState<"default" | "on" | "off">(c.aiMode ?? "default");
  const [aiOpen, setAiOpen] = useState(false);
  // nome local: reflete a renomeação na hora, sem esperar o refetch
  const [localName, setLocalName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLocalName(null); setEditing(false); }, [c.contact.id]);
  useEffect(() => { setAiModeLocal(c.aiMode ?? "default"); }, [c.id, c.aiMode]);

  const changeAiMode = async (mode: "default" | "on" | "off") => {
    setAiModeLocal(mode);
    setAiOpen(false);
    try {
      await setAiMode(c.id, mode);
      toast({ title: mode === "on" ? "IA ativada nesta conversa" : mode === "off" ? "IA pausada nesta conversa" : "IA seguindo o padrão geral" });
    } catch (e: any) {
      setAiModeLocal(c.aiMode ?? "default");
      toast({ title: "Não foi possível alterar a IA", description: e?.message, variant: "destructive" });
    }
  };

  const effectiveName = localName ?? c.contact.name;
  const title = displayName(effectiveName, c.contact.phone);
  const initials = initialsOf(effectiveName, c.contact.phone);

  const startEdit = () => {
    // pré-preenche só quando já é um nome de verdade (não o telefone)
    setDraft(isUsableName(effectiveName) ? effectiveName.trim() : "");
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await rename(c.contact.id, draft);
      setLocalName(draft.trim());
      setEditing(false);
      toast({ title: "Contato renomeado" });
    } catch (e: any) {
      toast({ title: "Não foi possível renomear", description: e?.message, variant: "destructive" });
    } finally { setSaving(false); }
  };
  const canal = c.connectionName ? `via ${c.connectionName}` : "WhatsApp";
  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
      {onBack && (
        <button onClick={onBack} className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      {c.contact.avatarUrl ? (
        <img src={c.contact.avatarUrl} alt={title} className="h-12 w-12 flex-none rounded-full object-cover sm:h-14 sm:w-14" loading="lazy" decoding="async" />
      ) : (
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary sm:h-14 sm:w-14">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="group flex items-center gap-2">
          {editing ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !saving) void save(); if (e.key === "Escape") setEditing(false); }}
                placeholder="Nome do contato"
                className="w-44 rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              />
              <button onClick={() => void save()} disabled={saving} title="Salvar" className="rounded-lg p-1 text-success hover:bg-success/10 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button onClick={() => setEditing(false)} title="Cancelar" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <>
              <span className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground sm:text-[22px]">{title}</span>
              <button
                onClick={startEdit}
                title="Renomear contato"
                className="flex-shrink-0 rounded-lg p-1 text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground hover:opacity-100 group-hover:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {c.isPatient && (
            <span className="hidden flex-shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success sm:inline">Paciente</span>
          )}
          {/* Etiquetas reais do WhatsApp */}
          {(c.tags ?? []).slice(0, 3).map((t) => (
            <span
              key={t.id}
              style={{ backgroundColor: `${t.color ?? "#94A3B8"}26`, color: t.color ?? undefined }}
              className="hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium lg:inline"
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-x-3 overflow-hidden whitespace-nowrap text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
            {maskPhone(c.contact.phone) || c.contact.phone}
          </span>
          <span className="hidden whitespace-nowrap sm:inline">{canal}</span>
          {c.contact.city && <span className="hidden items-center gap-1 sm:inline-flex"><MapPin className="h-3.5 w-3.5" />{c.contact.city}</span>}
          {c.assigneeName && <span className="hidden truncate xl:inline">· {c.assigneeName}</span>}
        </div>
      </div>
      <div className="flex flex-none items-center gap-2">
        {actions}
        {/* Agente de IA nesta conversa */}
        <Popover open={aiOpen} onOpenChange={setAiOpen}>
          <PopoverTrigger asChild>
            <button
              title="Agente de IA nesta conversa"
              aria-label="Agente de IA nesta conversa"
              className={cn(
                "hidden h-11 w-11 items-center justify-center rounded-2xl border shadow-elevation-sm transition-colors sm:flex",
                aiMode === "on" ? "border-primary bg-primary text-primary-foreground"
                  : aiMode === "off" ? "border-border bg-muted text-muted-foreground"
                  : "border-border bg-card text-primary hover:border-primary/40",
              )}
            >
              <Bot className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1">
            <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">IA nesta conversa</p>
            {([
              { k: "default" as const, t: "Seguir o padrão geral", d: "Obedece ao interruptor das Configurações." },
              { k: "on" as const, t: "Ativar aqui", d: "A IA age nesta conversa mesmo com o geral desligado." },
              { k: "off" as const, t: "Pausar aqui", d: "A IA não mexe nesta conversa." },
            ]).map((o) => (
              <button
                key={o.k}
                onClick={() => void changeAiMode(o.k)}
                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
              >
                {aiMode === o.k ? <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" /> : <span className="w-3.5 flex-shrink-0" />}
                <span>
                  <span className="block text-sm text-foreground">{o.t}</span>
                  <span className="block text-[11px] text-muted-foreground">{o.d}</span>
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        {menu}
      </div>
    </div>
  );
}
