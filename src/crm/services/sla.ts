import { estaResolvida, useAtivacaoLista, type FichaAtivacao } from "./ativacao";
import { useLeadsList } from "./leads";

// Tempo de resposta ao paciente: o que está esperando agora e há quanto tempo.
// Tudo sai das mesmas listas que o CRM já carrega (quadro "Ativar pacientes" e
// leads), sem consulta nova ao banco.

/** Meta de primeira resposta da recepção. */
export const META_RESPOSTA_MIN = 15;
/** A partir daqui o paciente foi esquecido. */
export const ESQUECIDO_H = 24;
/** A partir daqui a chance de perder o paciente é alta. */
export const PERDENDO_DIAS = 4;
/** Lead do site sem ninguém mexer depois deste tempo. */
export const LEAD_PARADO_H = 1;

const MIN = 60_000;
const HORA = 60 * MIN;

export interface ResumoSla {
  /** Paciente falou por último e ninguém respondeu (fichas resolvidas ficam de fora). */
  aguardando: FichaAtivacao[];
  /** Esperando além da meta de resposta. */
  atrasados: number;
  /** Esperando há mais de 24 h. */
  esquecidos: number;
  /** Esperando há mais de 4 dias. */
  perdendo: number;
  /** Aguardando e sem responsável. */
  semResponsavel: number;
  /** Quem espera há mais tempo. */
  maisAntigo: FichaAtivacao | null;
}

export function calcularSla(fichas: FichaAtivacao[], agora = Date.now()): ResumoSla {
  const aguardando = fichas
    .filter((f) => f.ultimaDirecao === "in" && !estaResolvida(f))
    .sort((a, b) => a.ultimaMsgEm.localeCompare(b.ultimaMsgEm));
  const espera = (f: FichaAtivacao) => agora - new Date(f.ultimaMsgEm).getTime();
  return {
    aguardando,
    atrasados: aguardando.filter((f) => espera(f) > META_RESPOSTA_MIN * MIN).length,
    esquecidos: aguardando.filter((f) => espera(f) > ESQUECIDO_H * HORA).length,
    perdendo: aguardando.filter((f) => espera(f) > PERDENDO_DIAS * 24 * HORA).length,
    semResponsavel: aguardando.filter((f) => !f.assigneeId).length,
    maisAntigo: aguardando[0] ?? null,
  };
}

/** Leads ainda na etapa "Novo" há mais de 1 h: ninguém puxou a conversa. */
export function leadsParados(leads: { status: string; created_at: string }[], agora = Date.now()) {
  return leads.filter((l) => l.status === "novo" && agora - new Date(l.created_at).getTime() > LEAD_PARADO_H * HORA);
}

export function useSla() {
  const lista = useAtivacaoLista();
  const leads = useLeadsList("novo");
  const resumo = calcularSla(lista.data ?? []);
  return {
    ...resumo,
    leadsParados: leadsParados(leads.data ?? []).length,
    carregando: lista.isLoading,
  };
}
