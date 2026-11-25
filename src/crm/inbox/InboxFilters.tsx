import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Filter, Globe, Search, Tag, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { InboxFilterKey } from "../sdk/types";
import { ETAPAS, ORIGENS, type EtapaFunil, type OrigemLead } from "../sdk/funil";

// Separação principal: por vendedor.
const PRIMARY: { key: InboxFilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "no_reply", label: "Sem resposta" },
  { key: "mine", label: "Minhas" },
  { key: "unassigned", label: "Sem responsável" },
  { key: "unread", label: "Não lidas" },
];

const STATUS: { key: InboxFilterKey; label: string }[] = [
  { key: "in_progress", label: "Em atendimento" },
  { key: "waiting", label: "Aguardando" },
  { key: "closed", label: "Finalizadas" },
  { key: "patients", label: "Pacientes" },
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
  search: string;
  onSearch: (value: string) => void;
  active: InboxFilterKey;
  counts: Partial<Record<InboxFilterKey, number>>;
  tags: InboxTag[];
  activeTagId: string | null;
  onChange: (filter: InboxFilterKey) => void;
  onChangeTag: (tagId: string | null) => void;
  etapa: EtapaFunil | null;
  origem: OrigemLead | null;
  etapaCounts: Partial<Record<EtapaFunil, number>>;
  origemCounts: Partial<Record<OrigemLead, number>>;
  onChangeEtapa: (etapa: EtapaFunil | null) => void;
  onChangeOrigem: (origem: OrigemLead | null) => void;
}

export function InboxFilters({
  search,
  onSearch,
  active,
  counts,
  tags,
  activeTagId,
  onChange,
  onChangeTag,
  etapa,
  origem,
  etapaCounts,
  origemCounts,
  onChangeEtapa,
  onChangeOrigem,
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
    <div className="px-4 pb-3 md:px-5">
      {/* separação principal: pílulas com contagem */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {PRIMARY.map((item) => {
          const selected = active === item.key;
          const count = counts[item.key] ?? 0;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              aria-pressed={selected}
              className={cn(
                "flex h-10 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
                selected
                  ? "bg-foreground text-background shadow-elevation-sm"
                  : "border border-border bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span className="whitespace-nowrap">{item.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-px text-center text-[11px] tabular-nums",
                    selected ? "bg-background/20 text-background" : "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar por nome, telefone ou mensagem…"
            aria-label="Buscar conversas"
            className="h-12 w-full rounded-2xl border border-border bg-card pl-10 pr-3 text-sm shadow-elevation-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </div>
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <button
              title="Filtrar por situação"
              aria-label="Filtrar por situação"
              className={cn(
                "flex h-12 flex-shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-3.5 text-xs font-medium shadow-elevation-sm transition-colors",
                statusActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Filter className="h-[18px] w-[18px]" strokeWidth={1.75} />
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
                <OptionRow
                  key={item.key}
                  selected={selected}
                  label={item.label}
                  count={counts[item.key] ?? 0}
                  onClick={() => {
                    onChange(selected ? "all" : item.key);
                    setStatusOpen(false);
                  }}
                />
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <ChoicePopover
          icon={<TrendingUp className="h-3.5 w-3.5 flex-none" />}
          placeholder="Funil"
          title="Etapa do funil"
          options={ETAPAS.map((e) => ({ key: e.key, label: e.label, count: etapaCounts[e.key] ?? 0 }))}
          value={etapa}
          onChange={(value) => onChangeEtapa(value as EtapaFunil | null)}
        />
        <ChoicePopover
          icon={<Globe className="h-3.5 w-3.5 flex-none" />}
          placeholder="Origem"
          title="Origem do lead"
          options={ORIGENS.map((o) => ({ key: o.key, label: o.label, count: origemCounts[o.key] ?? 0 }))}
          value={origem}
          onChange={(value) => onChangeOrigem(value as OrigemLead | null)}
        />

        {tags.length > 0 && (
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
                  "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border px-3 text-left text-xs transition",
                  activeTag
                    ? "border-primary/50 bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
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
            <PopoverContent align="end" className="w-72 p-2">
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
        )}
        {activeTag && (
          <button
            onClick={() => onChangeTag(null)}
            title="Limpar etiqueta"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function OptionRow({
  selected,
  label,
  count,
  onClick,
}: {
  selected: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-muted"
    >
      <span className="flex items-center gap-2">
        {selected ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <span className="w-3.5" />
        )}
        {label}
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </button>
  );
}

/** Botão compacto que abre uma lista de opções; clicar de novo na escolhida limpa. */
function ChoicePopover({
  icon,
  placeholder,
  title,
  options,
  value,
  onChange,
}: {
  icon: ReactNode;
  placeholder: string;
  title: string;
  options: { key: string; label: string; count: number }[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title={title}
          className={cn(
            "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full border px-3 text-left text-xs transition",
            selected
              ? "border-primary/50 bg-primary/5 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate">
            {selected ? selected.label : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {options.map((option) => {
          const isSelected = option.key === value;
          return (
            <OptionRow
              key={option.key}
              selected={isSelected}
              label={option.label}
              count={option.count}
              onClick={() => {
                onChange(isSelected ? null : option.key);
                setOpen(false);
              }}
            />
          );
        })}
        {selected && (
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-muted"
          >
            Mostrar todas
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
