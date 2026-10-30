import { useState } from "react";
import { Search, Inbox as InboxIcon, MessageSquarePlus } from "lucide-react";
import { InboxFilters } from "./InboxFilters";
import { ConversationCard } from "./ConversationCard";
import { NewConversationDialog } from "./NewConversationDialog";
import {
  useConversations,
  useInboxCounts,
  useInboxTags,
} from "../services/conversations";
import { useCrmContext } from "../provider/CrmProvider";
import { useListaCrescente } from "@/hooks/use-lista-crescente";
import type { CrmConversation, InboxFilterKey } from "../sdk/types";

interface Props {
  selectedId: string | null;
  onSelect: (conversation: CrmConversation) => void;
}

export function ConversationQueue({ selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<InboxFilterKey>("all");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [tagId, setTagId] = useState<string | null>(null);
  const { activeConnectionId, activeConnection } = useCrmContext();
  const conversations = useConversations(filter, search, tagId);
  const counts = useInboxCounts();
  const tags = useInboxTags();
  const { visiveis, containerRef, sentinelaRef, temMais } = useListaCrescente(conversations, {
    chave: `${filter}|${search}|${tagId ?? ""}`,
  });

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-background md:w-[52vw] md:max-w-[720px] md:min-w-[520px]">
      <div className="px-4 pt-5 md:px-5 md:pt-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">
              Conversas
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {activeConnection ? `Painel ${activeConnection.displayName}` : "Nenhum WhatsApp liberado"}
            </p>
          </div>
          <button
            onClick={() => setNewOpen(true)}
            title="Nova conversa"
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white transition hover:bg-primary"
          >
            <MessageSquarePlus className="h-5 w-5" />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar conversas…"
            className="h-11 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <NewConversationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onStarted={onSelect}
        defaultConnectionId={activeConnectionId}
      />
      <InboxFilters
        active={filter}
        counts={counts}
        tags={tags}
        activeTagId={tagId}
        onChange={setFilter}
        onChangeTag={setTagId}
      />

      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <InboxIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            {filter !== "all" || tagId || search.trim() ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  Nada com esses filtros
                </p>
                <button
                  onClick={() => {
                    setFilter("all");
                    setTagId(null);
                    setSearch("");
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Limpar filtros
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  Nenhuma conversa ainda
                </p>
                <p className="text-xs text-muted-foreground">
                  As conversas aparecerão aqui quando a conexão do WhatsApp
                  estiver ativa.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {visiveis.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                onClick={() => onSelect(conversation)}
              />
            ))}
            {temMais && (
              <div ref={sentinelaRef} className="px-5 py-4 text-xs text-muted-foreground">
                Carregando mais conversas…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
