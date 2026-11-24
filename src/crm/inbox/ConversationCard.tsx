import { cn } from "@/lib/utils";
import { Flame, Globe } from "lucide-react";
import type { CrmConversation } from "../sdk/types";
import { nomeDaEtapa, nomeDaOrigem } from "../sdk/funil";
import { displayName, initialsOf } from "../sdk/phone";
import { horaDaLista } from "../sdk/datas";

const STATUS_STYLE: Record<string, string> = {
  novo: "bg-primary/10 text-primary",
  em_atendimento: "bg-accent text-accent-foreground",
  aguardando: "bg-warning/15 text-warning",
  finalizado: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  novo: "Novo", em_atendimento: "Em atendimento", aguardando: "Aguardando", finalizado: "Finalizado",
};

interface Props {
  conversation: CrmConversation;
  selected: boolean;
  onClick: () => void;
}

export function ConversationCard({ conversation: c, selected, onClick }: Props) {
  // Contato sem nome salvo: mostra o telefone formatado em vez do número cru.
  const title = displayName(c.contact.name, c.contact.phone);
  const initials = initialsOf(c.contact.name, c.contact.phone);
  const naoLida = c.unread > 0;
  return (
    <button
      onClick={onClick}
      aria-current={selected || undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
        selected ? "bg-primary/10" : "hover:bg-muted/60",
      )}
    >
      <div className="relative flex-shrink-0">
        {c.contact.avatarUrl ? (
          <img src={c.contact.avatarUrl} alt={title} className="h-12 w-12 rounded-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground/70">
            {initials}
          </div>
        )}
        {/* canal: selo do WhatsApp no canto do avatar */}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-[#25D366] text-white" aria-hidden>
          <WhatsAppGlyph />
        </span>
        {c.priority === "alta" && (
          <Flame className="absolute -left-1 -top-1 h-4 w-4 rounded-full bg-card p-[1px] text-destructive" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-[15px] text-foreground", naoLida ? "font-bold" : "font-semibold")}>{title}</span>
          <span className={cn("flex-shrink-0 text-xs", naoLida ? "font-medium text-primary" : "text-muted-foreground")}>
            {horaDaLista(c.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={cn("truncate text-sm", naoLida ? "text-foreground" : "text-muted-foreground")}>{c.lastMessage}</p>
          {naoLida && (
            <span className="flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {c.unread > 99 ? "99+" : c.unread}
            </span>
          )}
        </div>
        {(c.leadStage || (c.leadOrigin && c.leadOrigin !== "whatsapp") || c.isPatient || (c.tags?.length ?? 0) > 0 || c.status === "aguardando") && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {c.status === "aguardando" && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE.aguardando)}>{STATUS_LABEL.aguardando}</span>
            )}
            {c.leadStage && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {nomeDaEtapa(c.leadStage)}
              </span>
            )}
            {c.leadOrigin && c.leadOrigin !== "whatsapp" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Globe className="h-2.5 w-2.5" />{nomeDaOrigem(c.leadOrigin)}
              </span>
            )}
            {c.isPatient && (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">Paciente</span>
            )}
            {(c.tags ?? []).slice(0, 1).map((t) => (
              <span
                key={t.id}
                style={{ backgroundColor: `${t.color ?? "#94A3B8"}26`, color: t.color ?? undefined }}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              >
                {t.label}
              </span>
            ))}
            {(c.tags?.length ?? 0) > 1 && (
              <span className="text-[10px] text-muted-foreground">+{(c.tags?.length ?? 0) - 1}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

/** Ícone do WhatsApp (balão com telefone), no tamanho do selo do avatar. */
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z" />
    </svg>
  );
}
