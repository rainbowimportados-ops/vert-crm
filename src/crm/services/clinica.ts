import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

// Sistema da clínica (Santé ou outro): cadastro e ficha do paciente lida pela
// edge function crm-clinica. A senha nunca passa por aqui depois de salva.

export interface SistemaClinica {
  nome: string;
  tipo: "login_web" | "api_token";
  base_url: string;
  login_url: string;
  campo_usuario: string;
  campo_senha: string;
  usuario: string | null;
  busca_paciente: string;
  padrao_id: string;
  paginas_paciente: string[];
  link_paciente: string;
  ativo: boolean;
  segredo_salvo: boolean;
  ultimo_teste: { em: string; passos: { passo: string; ok: boolean; detalhe?: string }[] } | null;
}

/** Valores prontos do Santé Odonto (login web em app.santeodonto.io). */
export const PRESET_SANTE: Omit<SistemaClinica, "usuario" | "ativo" | "segredo_salvo" | "ultimo_teste"> = {
  nome: "Santé",
  tipo: "login_web",
  base_url: "https://app.santeodonto.io",
  login_url: "/users/sign_in",
  campo_usuario: "user[email]",
  campo_senha: "user[password]",
  busca_paciente: "/customers?search={telefone_local}",
  padrao_id: "/customers/(\\d+)",
  paginas_paciente: ["/customers/{id}/edit", "/customers/{id}/budgets"],
  link_paciente: "/customers/{id}/edit",
};

export interface OrcamentoClinica {
  titulo: string;
  data: string | null;
  aguardando: number | null;
  aprovado: number | null;
  situacao: string | null;
}

export interface FichaClinica {
  status: "ok" | "nao_encontrado" | "erro";
  external_id: string | null;
  external_url: string | null;
  paciente: { nome: string | null; telefone: string | null; desde: string | null; observacao: string | null; confere?: boolean } | null;
  orcamentos: OrcamentoClinica[];
  total_aguardando: number;
  total_aprovado: number;
  vinculado_manual: boolean;
  erro: string | null;
  buscado_em: string;
}

export function useSistemaClinica() {
  const { organizationId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-clinica-sistema", organizationId],
    staleTime: 60_000,
    queryFn: async (): Promise<SistemaClinica | null> => {
      const { data, error } = await supabase
        .from("crm_clinic_systems" as never)
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return (data as SistemaClinica | null) ?? null;
    },
  });
}

export function useFichaClinica(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-clinica-ficha", contactId],
    enabled: !!contactId,
    staleTime: 30_000,
    queryFn: async (): Promise<FichaClinica | null> => {
      const { data, error } = await supabase
        .from("crm_clinic_snapshots" as never)
        .select("*")
        .eq("contact_id", contactId)
        .maybeSingle();
      if (error) throw error;
      return (data as FichaClinica | null) ?? null;
    },
  });
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("crm-clinica", { body });
  if (error) throw new Error("O sistema da clínica não respondeu agora. Tente de novo.");
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useAcoesClinica() {
  const qc = useQueryClient();
  const { organizationId, activeConnectionId } = useCrmContext();
  const atualizar = async (contactId?: string) => {
    await qc.invalidateQueries({ queryKey: ["crm-clinica-sistema", organizationId] });
    if (contactId) await qc.invalidateQueries({ queryKey: ["crm-clinica-ficha", contactId] });
    await qc.invalidateQueries({ queryKey: ["crm-ativacao", activeConnectionId] });
  };
  return {
    salvar: async (config: Partial<SistemaClinica>, senha?: string) => {
      await chamar({ acao: "salvar", config, senha: senha || undefined });
      await atualizar();
    },
    testar: async (telefone?: string) => {
      const r = await chamar<{ ok: boolean; passos: { passo: string; ok: boolean; detalhe?: string }[] }>({ acao: "testar", telefone });
      await atualizar();
      return r;
    },
    buscar: async (contactId: string, forcar = false) => {
      const r = await chamar<{ ficha: FichaClinica }>({ acao: "buscar", contactId, forcar });
      await atualizar(contactId);
      return r.ficha;
    },
    vincular: async (contactId: string, link: string) => {
      const r = await chamar<{ ficha: FichaClinica }>({ acao: "vincular", contactId, link });
      await atualizar(contactId);
      return r.ficha;
    },
  };
}

export const reais = (v: number | null | undefined) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "R$ 13,8 mil" para os números do topo do quadro. */
export function reaisCurto(v: number) {
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return reais(v);
}
