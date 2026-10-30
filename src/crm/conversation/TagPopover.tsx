import { useState } from "react";
import { Check, Plus, Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useTags,
  useContactTags,
  useTagActions,
} from "../services/atendimento";

export function TagPopover({
  contactId,
  onClose,
}: {
  contactId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: tags } = useTags();
  const { data: applied } = useContactTags(contactId);
  const { createTag, toggle } = useTagActions();
  const [newTag, setNewTag] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const appliedSet = new Set(applied ?? []);
  const visibleTags = (tags ?? []).filter((tag: any) =>
    tag.label.toLowerCase().includes(query.toLowerCase()),
  );

  const handleToggle = async (tagId: string, on: boolean) => {
    setBusy(true);
    try {
      await toggle(contactId, tagId, on);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const label = newTag.trim();
    if (!label) return;
    setBusy(true);
    try {
      const id = await createTag(label);
      await toggle(contactId, id, true);
      setNewTag("");
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute left-4 top-12 z-20 w-72 rounded-xl border border-border bg-card p-2 shadow-elevation-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar etiqueta…"
          className="h-9 w-full rounded-xl border border-border bg-background pl-8 pr-2.5 text-xs outline-none focus:border-primary"
        />
      </div>
      <div className="mb-2 flex items-center gap-1">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="Nova etiqueta…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={handleCreate}
          disabled={busy || !newTag.trim()}
          className="rounded-xl border border-border p-1.5 hover:bg-muted disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto pr-1">
        {(tags ?? []).length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            Nenhuma etiqueta ainda.
          </div>
        ) : visibleTags.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            Nenhuma etiqueta encontrada.
          </div>
        ) : (
          visibleTags.map((t: any) => {
            const on = appliedSet.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => handleToggle(t.id, !on)}
                disabled={busy}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ backgroundColor: t.color || "#9A603C" }}
                  />
                  <span className="truncate">{t.label}</span>
                </span>
                {on && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })
        )}
      </div>
      <div className="mt-1 border-t border-border pt-1 text-right">
        <button
          onClick={onClose}
          className="rounded-xl px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
