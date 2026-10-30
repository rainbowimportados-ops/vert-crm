import { useMemo, useState } from "react";
import { Check, Filter, Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { InboxFilterKey } from "../sdk/types";

const PRIMARY: { key: InboxFilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "unread", label: "Não lidas" },
  { key: "patients", label: "Pacientes" },
];

const STATUS: { key: InboxFilterKey; label: string }[] = [
  { key: "in_progress", label: "Em atendimento" },
  { key: "waiting", label: "Aguardando" },
  { key: "unassigned", label: "Sem responsável" },
  { key: "closed", label: "Finalizadas" },
];

const STATUS_LABELS = Object.fromEntries(
  STATUS.map((item) => [item.key, item.label]),
);

interface InboxTag {
  id: string;
  label: string;
  color?: string | null;
  count?: number;
}

interface Props {
  active: InboxFilterKey;
  counts: Partial<Record<InboxFilterKey, number>>;
  tags: InboxTag[];
  activeTagId: string | null;
  onChange: (filter: InboxFilterKey) => void;
  onChangeTag: (tagId: string | null) => void;
}

export function InboxFilters({
  active,
  counts,
  tags,
  activeTagId,
  onChange,
  onChangeTag,
}: Props) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const statusActive = STATUS.some((item) => item.key === active);
  const activeTag = tags.find((item) => item.id === activeTagId) ?? null;
  const visibleTags = useMemo(
    () =>
      tags.filter((item) =>
        item.label.toLowerCase().includes(tagQuery.toLowerCase()),
      ),
    [tags, tagQuery],
  );

  return (
    <div className="border-b border-border px-3 pb-2 pt-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 rounded-xl bg-muted p-0.5">
          {PRIMARY.map((item) => {
            const selected = active === item.key;
            const count = counts[item.key] ?? 0;
            return (
              <button
                key={item.key}
                onClick={() => onChange(item.key)}
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                  selected
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="truncate">{item.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      selected ? "text-primary" : "text-foreground/40",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <button
              title="Filtrar por situação"
              className={cn(
                "flex h-8 flex-shrink-0 items-center gap-1 rounded-xl border px-2 text-xs font-medium transition-colors",
                statusActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              {statusActive && (
                <span className="max-w-[90px] truncate">
                  {STATUS_LABELS[active]}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Filtrar por situação
            </p>
            {STATUS.map((item) => {
              const selected = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    onChange(selected ? "all" : item.key);
                    setStatusOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    {selected ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    {item.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {counts[item.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <Popover
            open={tagsOpen}
            onOpenChange={(open) => {
              setTagsOpen(open);
              if (!open) setTagQuery("");
            }}
          >
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 text-left text-xs transition",
                  activeTag
                    ? "border-primary/50 bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {" "}
                <Tag className="h-3.5 w-3.5 flex-none" />
                <span className="min-w-0 flex-1 truncate">
                  {activeTag ? activeTag.label : `Etiquetas (${tags.length})`}
                </span>
                {activeTag && (
                  <span className="text-[10px] tabular-nums opacity-70">
                    {activeTag.count ?? 0}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={tagQuery}
                  onChange={(event) => setTagQuery(event.target.value)}
                  placeholder="Pesquisar etiqueta…"
                  className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {visibleTags.length === 0 ? (
                  <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                    Nenhuma etiqueta encontrada.
                  </p>
                ) : (
                  visibleTags.map((item) => {
                    const selected = activeTagId === item.id;
                    const color = item.color ?? "#94A3B8";
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onChangeTag(selected ? null : item.id);
                          setTagsOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted",
                          selected && "bg-primary/5",
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 flex-none rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {item.label}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {item.count ?? 0}
                        </span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
          {activeTag && (
            <button
              onClick={() => onChangeTag(null)}
              title="Limpar etiqueta"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
