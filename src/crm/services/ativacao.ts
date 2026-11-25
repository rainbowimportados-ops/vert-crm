import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import type { CrmConversation, CrmMessage } from "../sdk/types";

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
  /** Última mensagem escrita pelo paciente (para sinais de risco). */
  textoPaciente: string;
  /** Paciente mandou áudio depois da última resposta da clínica. */
  audioSemResposta: boolean;
  leadEtapa: string | null;
  leadOrigem: string | null;
  /** Resumo do Claude para o cartão (null = ainda não gerado). */
  resumo: ResumoCartao | null;
  /** O que foi lido do sistema da clínica (Santé ou outro); null = ainda não lido. */
  clinica: { status: "ok" | "nao_encontrado" | "erro"; aguardando: number; aprovado: number; url: string | null } | null;
}

export interface ResumoCartao {
  resumo: string;
  proximo: string;
  etiquetas: string[];
  valor: string | null;
  /** Última mensagem que o Claude leu ao escrever o resumo. */
  baseEm: string;
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

/** Resumo existe e já leu a última mensagem da conversa. */
export function resumoEmDia(f: FichaAtivacao) {
  return !!f.resumo && new Date(f.resumo.baseEm).getTime() >= new Date(f.ultimaMsgEm).getTime();
}

export type TomEtiqueta = "risco" | "bom" | "valor" | "neutro";
export interface Etiqueta {
  texto: string;
  tom: TomEtiqueta;
}

const RISCO_PERDA = /or[çc]and|outr[oa]s? (lugar|cl[íi]nica|profissional)|desist|cancel|muito caro|n[ãa]o vou conseguir|vou pensar|deixar pra depois|deixar para (depois|um pr[óo]ximo)/i;
const RECLAMACAO = /n[ãa]o (ficou|tinha ficado) bo[am]|reclama|insatisfeit|incomodando|d[óo]i|doendo|caiu|quebrou|soltou/i;

/**
 * Etiquetas do cartão: as calculadas pelo CRM (lead, áudio, sinais no texto do
 * paciente) somadas às que o Claude deu no resumo, sem repetir.
 */
export function etiquetasDe(f: FichaAtivacao, nomeSistema = "sistema"): Etiqueta[] {
  const out: Etiqueta[] = [];
  const add = (texto: string, tom: TomEtiqueta) => {
    if (!out.some((e) => e.texto === texto)) out.push({ texto, tom });
  };
  if (f.leadEtapa === "finalizado") add("cliente", "bom");
  else if (f.leadEtapa === "perdido") add("lead perdido", "neutro");
  else if (f.leadEtapa) add(f.leadOrigem?.startsWith("site:") ? "lead do site" : "lead", "neutro");
  if (f.clinica?.status === "ok") add(`no ${nomeSistema}`, "bom");
  if (f.clinica?.aguardando) add(`${(f.clinica.aguardando).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} aguardando`, "valor");
  else if (f.clinica?.status === "nao_encontrado") add("lead novo", "neutro");
  if (f.audioSemResposta) add("ouvir áudio", "neutro");
  // sinais na última mensagem do paciente
  if (RECLAMACAO.test(f.textoPaciente)) add("risco de reclamação", "risco");
  else if (RISCO_PERDA.test(f.textoPaciente)) add("risco de perda", "risco");
  if (f.manutencao) add("manutenção", "neutro");
  for (const e of f.resumo?.etiquetas ?? []) {
    add(e, /risco/.test(e) ? "risco" : /fechar|agendad/.test(e) ? "bom" : "neutro");
  }
  if (f.resumo?.valor) add(f.resumo.valor, "valor");
  return out.slice(0, 5);
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
        textoPaciente: (r.texto_paciente as string) ?? "",
        audioSemResposta: !!r.audio_sem_resposta,
        leadEtapa: (r.lead_etapa as string) ?? null,
        leadOrigem: (r.lead_origem as string) ?? null,
        resumo: r.resumo
          ? {
              resumo: r.resumo as string,
              proximo: (r.proximo as string) ?? "",
              etiquetas: (r.etiquetas as string[]) ?? [],
              valor: (r.valor as string) ?? null,
              baseEm: r.resumo_base_em as string,
            }
          : null,
        clinica: r.clinica_status
          ? {
              status: r.clinica_status as "ok" | "nao_encontrado" | "erro",
              aguardando: Number(r.clinica_aguardando) || 0,
              aprovado: Number(r.clinica_aprovado) || 0,
              url: (r.clinica_url as string) ?? null,
            }
          : null,
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
  classificacao?: string;
  temperatura?: "fria" | "morna" | "quente";
  objecao?: string;
  aprovacao_necessaria?: string;
  pendencias?: string[];
  caminhos: CaminhoSugerido[];
}

async function chamarClaude<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("crm-ativacao", { body });
  if (error) {
    // a edge function devolve o motivo em JSON (ex.: chave do Claude ausente)
    let motivo: string | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") motivo = (await ctx.json())?.error ?? null;
    } catch {
      /* corpo sem JSON */
    }
    throw new Error(motivo || "O Claude não respondeu agora. Tente de novo.");
  }
  if (!data?.ok) throw new Error(data?.error || "Não deu agora. Tente de novo.");
  return data as T;
}

/** Quantos cartões o Claude resume por pedido (o mesmo limite da edge function). */
export const RESUMOS_POR_PEDIDO = 12;

/** Pede ao Claude o resumo dos cartões sem resumo ou com mensagem nova. */
export async function resumirFichas(conversationIds: string[]) {
  const r = await chamarClaude<{ resumos: Record<string, unknown>; aviso?: string | null }>({
    acao: "resumir",
    conversationIds: conversationIds.slice(0, RESUMOS_POR_PEDIDO),
  });
  return { gerados: Object.keys(r.resumos ?? {}).length, aviso: r.aviso ?? null };
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

/**
 * Ficha do copiloto para uma conversa aberta na tela de Conversas: usa a do
 * quadro quando existe; senão monta uma com as mensagens carregadas.
 */
export function fichaDaConversa(
  c: CrmConversation,
  mensagens: Pick<CrmMessage, "direction" | "content" | "createdAt" | "type">[],
  doQuadro?: FichaAtivacao | null,
): FichaAtivacao {
  if (doQuadro) return doQuadro;
  const ultima = mensagens[mensagens.length - 1];
  const entradas = mensagens.filter((m) => m.direction === "in");
  const ultimaEntrada = entradas[entradas.length - 1];
  return {
    conversationId: c.id,
    contactId: c.contact.id,
    nome: c.contact.name || null,
    telefone: c.contact.phone || null,
    instagram: null,
    assigneeId: c.assigneeId,
    ultimaDirecao: ultima?.direction ?? "in",
    ultimaMsgEm: ultima?.createdAt ?? c.lastMessageAt ?? new Date().toISOString(),
    ultimoTexto: ultima?.content ?? c.lastMessage ?? "",
    ultimaEntradaEm: ultimaEntrada?.createdAt ?? null,
    manutencao: false,
    resolvidaEm: null,
    textoPaciente: ultimaEntrada?.content ?? "",
    audioSemResposta: ultima?.direction === "in" && ultima.type === "audio",
    leadEtapa: null,
    leadOrigem: null,
    resumo: null,
    clinica: null,
  };
}
