import type { TipoMensagem } from "../services/ativacao";

// Roteiros que o Claude segue ao sugerir caminhos e escrever a mensagem.
// Editáveis na tela; a edição fica salva neste navegador.

export const TIPOS: { id: TipoMensagem; label: string }[] = [
  { id: "ativacao", label: "Ativação" },
  { id: "confirmacao", label: "Confirmação" },
  { id: "negociacao", label: "Negociação" },
];

export const ROTEIRO_PADRAO: Record<TipoMensagem, string> = {
  negociacao: `Objetivo: fechar sem baixar o valor de cara.
1. Gancho: acolha e retome o que o paciente quer (o resultado, a dor, o sonho), com as palavras dele.
2. Descoberta: se ainda não sabemos o que trava, faça UMA pergunta para descobrir o que pesa: o valor total, a parcela, a entrada ou a data.
3. Pitch curto: uma frase sobre o valor do tratamento para ele (qualidade, durabilidade, cuidado da Dra. Anita), sem jargão.
4. Fechamento condicional: quando já sabemos a condição, "Se eu conseguir essa condição para você hoje, fechamos?".
5. CTA: termine com uma ação clara e fácil (responder sim, escolher entre duas opções, reservar o horário).
Nunca ofereça desconto ou condição que não esteja na instrução da clínica: diga que vai verificar.`,
  ativacao: `Objetivo: reabrir a conversa e levar a um próximo passo.
1. Gancho: retome o interesse ou a dor que o paciente mostrou, de forma pessoal (nada de mensagem de disparo).
2. Pergunta aberta curta que ele responda fácil (ex.: "Ainda faz sentido para você cuidar disso agora?").
3. Mini pitch: um benefício concreto de resolver agora.
4. CTA: proponha um passo concreto, de preferência com duas opções (dois horários, avaliação presencial ou online).`,
  confirmacao: `Objetivo: tirar a dúvida e confirmar o próximo passo.
1. Retome em uma frase o que foi combinado.
2. Confirme ou proponha data, horário ou envio (contrato, link, orçamento).
3. CTA de resposta simples: "Posso confirmar?" ou "Qual das duas opções fica melhor?"`,
};

const CHAVE = "vert-crm-roteiros";

export function lerRoteiros(): Record<TipoMensagem, string> {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || "{}");
    return { ...ROTEIRO_PADRAO, ...salvo };
  } catch {
    return { ...ROTEIRO_PADRAO };
  }
}

export function salvarRoteiros(r: Record<TipoMensagem, string>) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(r));
  } catch {
    /* navegador sem armazenamento: vale só nesta sessão */
  }
}
