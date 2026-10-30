import { useEffect, useState } from "react";
import { ArrowLeft, Phone, MapPin, MessageCircle, Pencil, Check, X, Loader2, Bot } from "lucide-react";
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
}

export function ContactHeader({ conversation: c, onBack }: Props) {
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
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-3 sm:gap-3 sm:px-4">
      {onBack && (
        <button onClick={onBack} className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      {c.contact.avatarUrl ? (
        <img src={c.contact.avatarUrl} alt={title} className="h-11 w-11 rounded-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
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
              <span className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-foreground">{title}</span>
              <button
                onClick={startEdit}
                title="Renomear contato"
                className="flex-shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {c.isPatient && (
            <span className="hidden flex-shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success sm:inline">Paciente</span>
          )}
          {/* Etiquetas reais do WhatsApp */}
          {(c.tags ?? []).map((t) => (
            <span
              key={t.id}
              style={{ backgroundColor: `${t.color ?? "#94A3B8"}26`, color: t.color ?? undefined }}
              className="hidden flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline"
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 whitespace-nowrap"><Phone className="h-3 w-3" />{maskPhone(c.contact.phone) || c.contact.phone}</span>
          {c.connectionName && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-success">
              <MessageCircle className="h-3 w-3" /> via {c.connectionName}
              {c.connectionPhone ? ` · ${maskPhone(c.connectionPhone) || c.connectionPhone}` : ""}
            </span>
          )}
          {c.contact.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.contact.city}</span>}
          {c.assigneeName && <span>· {c.assigneeName}</span>}
        </div>
      </div>
      {/* Agente de IA nesta conversa */}
      <Popover open={aiOpen} onOpenChange={setAiOpen}>
        <PopoverTrigger asChild>
          <button
            title="Agente de IA nesta conversa"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              aiMode === "on" ? "bg-primary text-primary-foreground"
                : aiMode === "off" ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary",
            )}
          >
            <Bot className="h-4 w-4" />
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
      <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success sm:flex" title="WhatsApp">
        <MessageCircle className="h-4 w-4" />
      </span>
    </div>
  );
}
