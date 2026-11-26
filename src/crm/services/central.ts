import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

// Central Organizadora (tela inicial): RPC crm_central + edge function crm-central.

export interface ItemConversa {
  conversation_id: string;
  connection_id: string;
  contact_id: string;
  nome: string | null;
  telefone: string | null;
  ult_em: string;
  ult_texto: string;
  caixa: string | null;
}

export interface ItemPrioridade extends ItemConversa {
  gaveta: "hoje" | "retomar";
  resumo: string | null;
  proximo: string | null;
  valor: string | null;
  assignee_id: string | null;
  tem_compromisso: boolean;
}

export interface ItemSemDono extends ItemConversa {
  origem: string;
}

export interface Compromisso {
  id: string;
  tipo: "promessa" | "retorno";
  texto: string;
  prazo: string | null;
  origem_em: string | null;
  responsavel_id: string | null;
  conversation_id: string;
  connection_id: string;
  contact_id: string;
  nome: string | null;
  telefone: string | null;
}

export interface MembroEquipe {
  id: string;
  nome: string;
  pendentes: number;
  compromissos: number;
}

export interface Central {
  gerado_em: string;
  whatsapp_lido_em: string | null;
  totais: {
    responder: number;
    retomar: number;
    ativar: number;
    promessas: number;
    promessas_vencidas: number;
    retornos: number;
    retornos_hoje: number;
    sem_dono: number;
  };
  prioridade: ItemPrioridade[];
  sem_dono: ItemSemDono[];
  compromissos: Compromisso[];
  equipe: MembroEquipe[];
}

export function useCentral() {
  const { organizationId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-central", organizationId],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<Central> => {
      const { data, error } = await supabase.rpc("crm_central" as never);
      if (error) throw error;
      return data as unknown as Central;
    },
  });
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("crm-central", { body });
  if (error) throw new Error("A Central não respondeu agora. Tente de novo.");
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useAcoesCentral() {
  const qc = useQueryClient();
  const { organizationId } = useCrmContext();
  const recarregar = () => qc.invalidateQueries({ queryKey: ["crm-central", organizationId] });
  return {
    /** Lê as conversas com mensagem nova (até 8 por vez) e atualiza a Central. */
    atualizar: async () => {
      const r = await chamar<{ lidas: number; novos: number; cumpridos: number; restam: boolean }>({ acao: "analisar" });
      await recarregar();
      return r;
    },
    concluir: async (id: string, status: "feito" | "descartado") => {
      const { error } = await supabase
        .from("crm_compromissos" as never)
        .update({ status, concluido_em: new Date().toISOString(), concluido_por: "manual" } as never)
        .eq("id", id);
      if (error) throw error;
      await recarregar();
    },
    transcrever: (messageId: string) => chamar<{ transcricao: string }>({ acao: "transcrever", messageId }),
  };
}

/** "Bom dia" / "Boa tarde" / "Boa noite" pelo horário de São Paulo. */
export function saudacao(agora = new Date()) {
  const h = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false })) % 24;
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const hojeLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Situação do prazo de um compromisso em relação a hoje (datas AAAA-MM-DD). */
export function situacaoPrazo(prazo: string | null, hoje = hojeLocal()) {
  if (!prazo) return "sem_prazo" as const;
  if (prazo < hoje) return "vencido" as const;
  if (prazo === hoje) return "hoje" as const;
  return "futuro" as const;
}

export function rotuloPrazo(prazo: string | null, hoje = hojeLocal()) {
  const s = situacaoPrazo(prazo, hoje);
  if (s === "sem_prazo") return "sem prazo";
  if (s === "hoje") return "hoje";
  const [, m, d] = prazo!.split("-");
  return s === "vencido" ? `venceu ${d}/${m}` : `até ${d}/${m}`;
}

const INTERVALO_LEITURA = 3 * 60_000;

/**
 * Leitura em tempo real só enquanto alguém usa o CRM: lê ao entrar e, com a
 * aba visível, a cada 3 minutos. Fora de uso (aba escondida ou CRM fechado)
 * não lê nada, e ao voltar para a aba lê na hora.
 */
export function useLeituraAutomatica() {
  const qc = useQueryClient();
  const { organizationId } = useCrmContext();
  useEffect(() => {
    if (!organizationId) return;
    let ultima = 0;
    let rodando = false;
    const ler = async () => {
      if (rodando || document.visibilityState !== "visible" || Date.now() - ultima < INTERVALO_LEITURA - 5_000) return;
      rodando = true;
      ultima = Date.now();
      try {
        const { data } = await supabase.functions.invoke("crm-central", { body: { acao: "analisar" } });
        if (data?.lidas) await qc.invalidateQueries({ queryKey: ["crm-central", organizationId] });
      } catch {
        /* sem rede ou sem chave: tenta de novo no próximo ciclo */
      } finally {
        rodando = false;
      }
    };
    void ler();
    const id = window.setInterval(() => void ler(), INTERVALO_LEITURA);
    const aoVoltar = () => void ler();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [organizationId, qc]);
}

export interface ItemPlano {
  acao: string;
  motivo: string;
  conversation_id: string;
  feito: boolean;
}

export interface IdeiaConteudo {
  titulo: string;
  roteiro: string;
  frase: string;
}

export interface ResumoDia {
  organization_id: string;
  dia: string;
  foco: string;
  plano: ItemPlano[];
  ideias: IdeiaConteudo[];
  gerado_em: string;
}

/**
 * Resumo e plano do dia + ideias de conteúdo. Se ainda não existe o de hoje,
 * pede para o Claude montar (primeira abertura do CRM no dia).
 */
export function useResumoDoDia() {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  const chave = ["crm-central-resumo", organizationId, hojeLocal()];
  const query = useQuery({
    queryKey: chave,
    staleTime: 5 * 60_000,
    enabled: !!organizationId,
    queryFn: async (): Promise<ResumoDia | null> => {
      const { data, error } = await supabase
        .from("crm_central_resumos" as never)
        .select("*")
        .eq("organization_id", organizationId)
        .eq("dia", hojeLocal())
        .maybeSingle();
      if (error) throw error;
      if (data) return data as unknown as ResumoDia;
      const r = await chamar<{ resumo: ResumoDia }>({ acao: "resumo" });
      return r.resumo;
    },
  });
  return {
    ...query,
    /** Refaz o resumo riscando o que já foi feito. */
    atualizar: async () => {
      const r = await chamar<{ resumo: ResumoDia }>({ acao: "resumo", forcar: true });
      qc.setQueryData(chave, r.resumo);
      return r.resumo;
    },
    marcar: async (indice: number, feito: boolean) => {
      const atual = query.data;
      if (!atual) return;
      const plano = atual.plano.map((p, i) => (i === indice ? { ...p, feito } : p));
      qc.setQueryData(chave, { ...atual, plano });
      const { error } = await supabase
        .from("crm_central_resumos" as never)
        .update({ plano } as never)
        .eq("organization_id", atual.organization_id)
        .eq("dia", atual.dia);
      if (error) {
        qc.setQueryData(chave, atual);
        throw error;
      }
    },
  };
}
