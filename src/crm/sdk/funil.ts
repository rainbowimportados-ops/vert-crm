// Funil de vendas e origem dos leads.
//
// As etapas reaproveitam os valores que já existem em crm_leads.status, para não
// quebrar relatórios nem dados antigos: só o nome mostrado mudou e entrou "perdido".

export type EtapaFunil = "novo" | "em_atendimento" | "aguardando" | "finalizado" | "perdido";

export const ETAPAS: { key: EtapaFunil; label: string; tone: "neutral" | "blue" | "amber" | "green" | "red" }[] = [
  { key: "novo", label: "Novo", tone: "neutral" },
  { key: "em_atendimento", label: "Em contato", tone: "blue" },
  { key: "aguardando", label: "Negociação", tone: "amber" },
  { key: "finalizado", label: "Ganho", tone: "green" },
  { key: "perdido", label: "Perdido", tone: "red" },
];

export function etapaDe(status: string | null | undefined): EtapaFunil {
  return ETAPAS.some((e) => e.key === status) ? (status as EtapaFunil) : "novo";
}

export function nomeDaEtapa(status: string | null | undefined): string {
  return ETAPAS.find((e) => e.key === etapaDe(status))!.label;
}

export type OrigemLead = "landing" | "digital_card" | "manual" | "whatsapp";

export const ORIGENS: { key: OrigemLead; label: string }[] = [
  { key: "landing", label: "Landing page" },
  { key: "digital_card", label: "Cartão digital" },
  { key: "manual", label: "Cadastro manual" },
  { key: "whatsapp", label: "WhatsApp direto" },
];

/** Origem a partir de crm_leads.source. Sem lead = a pessoa chamou direto no WhatsApp. */
export function origemDe(source: string | null | undefined, temLead: boolean): OrigemLead {
  if (!temLead || (source ?? "").toLowerCase() === "whatsapp") return "whatsapp";
  if (source === "site:landing") return "landing";
  if (source === "site:digital_card") return "digital_card";
  return "manual";
}

export function nomeDaOrigem(origem: OrigemLead): string {
  return ORIGENS.find((o) => o.key === origem)!.label;
}
