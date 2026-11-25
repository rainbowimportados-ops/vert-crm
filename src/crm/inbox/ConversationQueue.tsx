import { useMemo, useState } from "react";
import { Inbox as InboxIcon, SquarePen } from "lucide-react";
import { InboxFilters } from "./InboxFilters";
import { ConversationCard } from "./ConversationCard";
import { NewConversationDialog } from "./NewConversationDialog";
import {
  useConversations,
  useFunilCounts,
  useInboxCounts,
  useInboxTags,
} from "../services/conversations";
import type { EtapaFunil, OrigemLead } from "../sdk/funil";
import { useCrmContext } from "../provider/CrmProvider";
import { useListaCrescente } from "@/hooks/use-lista-crescente";
import type { CrmConversation, InboxFilterKey } from "../sdk/types";
import { useSla } from "../services/sla";
import { PainelAtendimento } from "../sla/PainelAtendimento";

interface Props {
  selectedId: string | null;
  onSelect: (conversation: CrmConversation) => void;
}

export function ConversationQueue({ selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<InboxFilterKey>("all");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [tagId, setTagId] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<EtapaFunil | null>(null);
  const [origem, setOrigem] = useState<OrigemLead | null>(null);
  const { activeConnectionId, activeConnection } = useCrmContext();
  const sla = useSla();
  const semResposta = useMemo(() => new Set(sla.aguardando.map((f) => f.conversationId)), [sla.aguardando]);
  const todas = useConversations(filter === "no_reply" ? "all" : filter, search, tagId, null, etapa, origem);
  // "Sem resposta": quem espera há mais tempo primeiro
  const conversations = useMemo(() => {
    if (filter !== "no_reply") return todas;
    return todas
      .filter((c) => semResposta.has(c.id))
      .sort((a, b) => (a.lastMessageAt ?? "").localeCompare(b.lastMessageAt ?? ""));
  }, [todas, filter, semResposta]);
  const contagens = useInboxCounts();
  const counts = useMemo(() => ({ ...contagens, no_reply: sla.aguardando.length }), [contagens, sla.aguardando.length]);
  const funil = useFunilCounts();
  const tags = useInboxTags();
  const { visiveis, containerRef, sentinelaRef, temMais } = useListaCrescente(conversations, {
    chave: `${filter}|${search}|${tagId ?? ""}|${etapa ?? ""}|${origem ?? ""}`,
  });
  const comFiltro = filter !== "all" || !!tagId || !!etapa || !!origem || !!search.trim();

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-background md:w-[340px] lg:w-[380px] 2xl:w-[460px]">
      <div className="px-4 pt-5 md:px-5 md:pt-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
              Conversas
            </h1>
            <p className="mt-1 truncate text-[15px] text-muted-foreground">
              {activeConnection ? `Atendimentos do ${activeConnection.displayName}` : "Nenhum WhatsApp liberado"}
            </p>
          </div>
          <button
            onClick={() => setNewOpen(true)}
            title="Nova conversa"
            aria-label="Nova conversa"
            className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elevation-md transition hover:brightness-95"
          >
            <SquarePen className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 md:px-5">
        <PainelAtendimento onOpen={onSelect} compacto />
      </div>

      <NewConversationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onStarted={onSelect}
        defaultConnectionId={activeConnectionId}
      />
      <InboxFilters
        search={search}
        onSearch={setSearch}
        active={filter}
        counts={counts}
        tags={tags}
        activeTagId={tagId}
        onChange={setFilter}
        onChangeTag={setTagId}
        etapa={etapa}
        origem={origem}
        etapaCounts={funil.etapas}
        origemCounts={funil.origens}
        onChangeEtapa={setEtapa}
        onChangeOrigem={setOrigem}
      />

      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 md:px-3">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <InboxIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            {comFiltro ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  Nada com esses filtros
                </p>
                <button
                  onClick={() => {
                    setFilter("all");
                    setTagId(null);
                    setEtapa(null);
                    setOrigem(null);
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
