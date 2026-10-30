// ============================================================
// CRM SDK — telefone: normalização, máscara e nome de exibição
// Usado pela caixa de entrada, cabeçalho da conversa, contatos
// e pelo diálogo de nova conversa.
// ============================================================

export const onlyDigits = (s: string): string => (s ?? "").replace(/\D/g, "");

/**
 * Máscara BR: (11) 91234-5678.
 * Aceita o 55 na frente (remove) e devolve +<digitos> quando é internacional.
 */
export function maskPhone(v: string): string {
  let d = onlyDigits(v).slice(0, 13);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); // DDI do Brasil
  if (d.length > 11) return `+${d}`;
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Um "nome" que não identifica ninguém: vazio, só o número (é assim que o
 * WhatsApp devolve quem não está na agenda) ou só pontuação/emoji (".", "🍀").
 * Basta ter uma letra em qualquer alfabeto para valer como nome.
 */
export function isUsableName(s: string | null | undefined): boolean {
  const t = (s ?? "").trim();
  if (!t) return false;
  if (/^[\d\s()+-]+$/.test(t)) return false;
  return /\p{L}/u.test(t);
}

/**
 * O que mostrar na lista/cabeçalho: o nome quando existe de verdade,
 * senão o telefone formatado. Nunca devolve string vazia.
 */
export function displayName(name: string | null | undefined, phone: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (isUsableName(n)) return n;
  const masked = maskPhone(phone || n);
  return masked || "Sem nome";
}

/** Iniciais para o avatar — some quando o "nome" é só número. */
export function initialsOf(name: string | null | undefined, phone: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (isUsableName(n)) {
    return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }
  const d = onlyDigits(phone || "");
  return d.slice(-2) || "?";
}
