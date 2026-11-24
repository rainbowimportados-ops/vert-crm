import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

// "Ativar pacientes": quadro de follow-up montado a partir das conversas.

export type Gaveta = "hoje" | "parado" | "follow" | "manut";

export const GAVETAS: { id: Gaveta; titulo: string; sub: string }[] = [
  { id: "hoje", titulo: "Responder hoje", sub: "Paciente falou por último, há menos de 4 dias" },
  { id: "parado", titulo: "Sem resposta 4+ dias", sub: "Paciente falou por último e ficou esperando" },
  { id: "follow", titulo: "Follow-up", sub: "A clínica falou por último: a bola está com o paciente" },
  { id: "manut", titulo: "Manutenção", sub: "Lembrete de manutenção sem resposta" },
];

export interface FichaAtivacao {
  conversationId: string;
  contactId: string;
  nome: string | null;
  telefone: string | null;
  instagram: string | null;
  assigneeId: string | null;
  ultimaDirecao: "in" | "out";
  ultimaMsgEm: string;
  ultimoTexto: string;
  ultimaEntradaEm: string | null;
  manutencao: boolean;
  resolvidaEm: string | null;
}

const DIA = 24 * 60 * 60 * 1000;

/** Em que gaveta a conversa cai (null = fora do quadro). */
export function gavetaDe(f: FichaAtivacao, agora = Date.now()): Gaveta | null {
  const idade = agora - new Date(f.ultimaMsgEm).getTime();
  if (f.manutencao) return "manut";
  if (f.ultimaDirecao === "in") return idade < 4 * DIA ? "hoje" : "parado";
  if (idade <= 30 * DIA) return "follow";
  return null;
}

/** Resolvida = marcada depois da última mensagem; mensagem nova reabre a ficha. */
export function estaResolvida(f: FichaAtivacao) {
  return !!f.resolvidaEm && new Date(f.resolvidaEm).getTime() >= new Date(f.ultimaMsgEm).getTime();
}

/** Janela de 24 h da API oficial do WhatsApp, a partir da última mensagem do paciente. */
export function janela24h(ultimaEntradaEm: string | null, agora = Date.now()) {
  if (!ultimaEntradaEm) return { aberta: false, restanteMin: 0, fechaEm: null as Date | null };
  const fim = new Date(new Date(ultimaEntradaEm).getTime() + DIA);
  const restante = Math.round((fim.getTime() - agora) / 60000);
  return { aberta: restante > 0, restanteMin: Math.max(0, restante), fechaEm: fim };
}

export function tempoDeEspera(iso: string, agora = Date.now()) {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}

export function useAtivacaoLista() {
  const { activeConnectionId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-ativacao", activeConnectionId],
    enabled: !!activeConnectionId,
    staleTime: 30_000,
    queryFn: async (): Promise<FichaAtivacao[]> => {
      const { data, error } = await supabase.rpc("crm_ativacao_lista" as never, { _connection: activeConnectionId } as never);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        conversationId: r.conversation_id as string,
        contactId: r.contact_id as string,
        nome: (r.nome as string) ?? null,
        telefone: (r.telefone as string) ?? null,
        instagram: (r.instagram as string) ?? null,
        assigneeId: (r.assignee_id as string) ?? null,
        ultimaDirecao: r.ultima_direcao === "in" ? "in" : "out",
        ultimaMsgEm: r.ultima_msg_em as string,
        ultimoTexto: (r.ultimo_texto as string) ?? "",
        ultimaEntradaEm: (r.ultima_entrada_em as string) ?? null,
        manutencao: !!r.manutencao,
        resolvidaEm: (r.resolvida_em as string) ?? null,
      }));
    },
  });
}

export function useMarcarResolvida() {
  const { activeConnectionId } = useCrmContext();
  const qc = useQueryClient();
  return async (conversationId: string, resolvida: boolean) => {
    const { error } = await supabase
      .from("conversations")
      .update({ ativacao_resolvida_em: resolvida ? new Date().toISOString() : null } as never)
      .eq("id", conversationId);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["crm-ativacao", activeConnectionId] });
  };
}

export type TipoMensagem = "ativacao" | "confirmacao" | "negociacao";

export interface CaminhoSugerido {
  titulo: string;
  quando: string;
  perguntas: string[];
  fechamento: string;
  risco: string;
  tipo: TipoMensagem;
  instrucao: string;
}

export interface Sugestao {
  resumo: string;
  etapa: string;
  caminhos: CaminhoSugerido[];
}

async function chamarClaude<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("crm-ativacao", { body });
  if (error) throw new Error("O Claude não respondeu agora. Tente de novo.");
  if (!data?.ok) throw new Error(data?.error || "Não deu agora. Tente de novo.");
  return data as T;
}

export function sugerirCaminhos(conversationId: string, roteiros: Record<TipoMensagem, string>) {
  return chamarClaude<Sugestao>({ acao: "caminhos", conversationId, roteiros });
}

export async function escreverMensagem(p: {
  conversationId: string;
  tipo: TipoMensagem;
  roteiros: Record<TipoMensagem, string>;
  extra: string;
  assina: string;
}) {
  const r = await chamarClaude<{ texto: string }>({ acao: "escrever", ...p });
  return r.texto;
}
