import { cn } from "@/lib/utils";
import { Flame, MapPin, MessageCircle } from "lucide-react";
import type { CrmConversation } from "../sdk/types";
import { displayName, initialsOf } from "../sdk/phone";

const STATUS_STYLE: Record<string, string> = {
  novo: "bg-primary/10 text-primary",
  em_atendimento: "bg-accent text-accent-foreground",
  aguardando: "bg-warning/15 text-warning",
  finalizado: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  novo: "Novo", em_atendimento: "Em atendimento", aguardando: "Aguardando", finalizado: "Finalizado",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface Props {
  conversation: CrmConversation;
  selected: boolean;
  onClick: () => void;
}

export function ConversationCard({ conversation: c, selected, onClick }: Props) {
  // Contato sem nome salvo: mostra o telefone formatado em vez do número cru.
  const title = displayName(c.contact.name, c.contact.phone);
  const initials = initialsOf(c.contact.name, c.contact.phone);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors",
        selected ? "bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <div className="relative flex-shrink-0">
        {c.contact.avatarUrl ? (
          <img src={c.contact.avatarUrl} alt={title} className="h-11 w-11 rounded-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials}
          </div>
        )}
        {c.priority === "alta" && (
          <Flame className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full bg-card p-[1px] text-destructive" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
          <span className="flex-shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.lastMessageAt)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.lastMessage}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", STATUS_STYLE[c.status])}>
            {STATUS_LABEL[c.status]}
          </span>
          {c.isPatient && (
            <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">Paciente</span>
          )}
          {c.connectionName && (
            <span className="inline-flex max-w-[145px] items-center gap-1 truncate rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <MessageCircle className="h-2.5 w-2.5 text-success" />{c.connectionName}
            </span>
          )}
          {/* Etiquetas reais do WhatsApp */}
          {(c.tags ?? []).slice(0, 2).map((t) => (
            <span
              key={t.id}
              style={{ backgroundColor: `${t.color ?? "#94A3B8"}26`, color: t.color ?? undefined }}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            >
              {t.label}
            </span>
          ))}
          {(c.tags?.length ?? 0) > 2 && (
            <span className="text-[10px] text-muted-foreground">+{(c.tags?.length ?? 0) - 2}</span>
          )}
          {c.primaryTag && (
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.primaryTag}</span>
          )}
          {c.contact.unit && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MapPin className="h-2.5 w-2.5" />{c.contact.unit}
            </span>
          )}
        </div>
      </div>

      {c.unread > 0 && (
        <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center self-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
          {c.unread}
        </span>
      )}
    </button>
  );
}
