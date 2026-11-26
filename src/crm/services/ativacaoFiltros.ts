import { etiquetasDe, gavetaDe, janela24h, type FichaAtivacao, type Gaveta } from "./ativacao";

// Filtros, ordenação e exportação do quadro Ativar pacientes (funções puras).

const DIA = 24 * 60 * 60 * 1000;

export type FaixaEspera = "0-3" | "4-7" | "8-30" | "30+";
export type Ordem = "urgencia" | "espera" | "valor" | "nome";

export const FAIXAS: { id: FaixaEspera; rotulo: string }[] = [
  { id: "0-3", rotulo: "até 3 dias" },
  { id: "4-7", rotulo: "4 a 7 dias" },
  { id: "8-30", rotulo: "8 a 30 dias" },
  { id: "30+", rotulo: "mais de 30 dias" },
];

export const ORIGENS: { id: string; rotulo: string }[] = [
  { id: "google_ads", rotulo: "Google Ads" },
  { id: "meta_ads", rotulo: "Meta Ads" },
  { id: "instagram", rotulo: "Instagram" },
  { id: "site", rotulo: "Site" },
  { id: "direto", rotulo: "WhatsApp direto" },
];

export interface FiltrosAtivacao {
  etiquetas: string[];
  origens: string[];
  esperas: FaixaEspera[];
  comValor: boolean;
  /** id do responsável, "sem" para sem responsável, "" para todos */
  responsavel: string;
  /** "" para todas, "aberta" ou "fechada" */
  janela: "" | "aberta" | "fechada";
}

export const FILTROS_VAZIOS: FiltrosAtivacao = {
  etiquetas: [], origens: [], esperas: [], comValor: false, responsavel: "", janela: "",
};

export function diasParado(f: FichaAtivacao, agora = Date.now()) {
  return Math.max(0, (agora - new Date(f.ultimaMsgEm).getTime()) / DIA);
}

export function faixaEspera(dias: number): FaixaEspera {
  if (dias <= 3) return "0-3";
  if (dias <= 7) return "4-7";
  if (dias <= 30) return "8-30";
  return "30+";
}

/** "R$ 12.850", "pede R$ 500 em R$ 800" -> maior valor citado, em reais. */
export function valorDoTexto(texto: string | null | undefined) {
  if (!texto) return 0;
  let maior = 0;
  for (const m of texto.matchAll(/R\$\s*([0-9][0-9.]*(?:,[0-9]{1,2})?)\s*(mil)?/gi)) {
    const n = Number(m[1].replace(/\./g, "").replace(",", ".")) * (m[2] ? 1000 : 1);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return maior;
}

/** Valor em jogo: o que está aguardando no sistema da clínica ou o citado na conversa. */
export function valorNumerico(f: FichaAtivacao) {
  return f.clinica?.aguardando || valorDoTexto(f.resumo?.valor);
}

/** Todas as etiquetas do cartão (sem o corte de 5 do cartão), para filtrar. */
export function todasEtiquetas(f: FichaAtivacao, nomeSistema: string) {
  return etiquetasDe(f, nomeSistema, 99).map((e) => e.texto);
}

/** Etiquetas disponíveis no conjunto, das mais frequentes para as menos. */
export function etiquetasDisponiveis(fichas: FichaAtivacao[], nomeSistema: string) {
  const conta = new Map<string, number>();
  for (const f of fichas) for (const e of todasEtiquetas(f, nomeSistema)) {
    if (/^R\$/.test(e) || /aguardando$/.test(e)) continue; // valores viram o filtro "com valor"
    conta.set(e, (conta.get(e) ?? 0) + 1);
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([texto, n]) => ({ texto, n }));
}

export function contarFiltros(f: FiltrosAtivacao) {
  return f.etiquetas.length + f.origens.length + f.esperas.length + (f.comValor ? 1 : 0) + (f.responsavel ? 1 : 0) + (f.janela ? 1 : 0);
}

export function aplicarFiltros(
  fichas: FichaAtivacao[],
  filtros: FiltrosAtivacao,
  opcoes: { nomeSistema: string; agora?: number },
) {
  const agora = opcoes.agora ?? Date.now();
  return fichas.filter((f) => {
    if (filtros.origens.length && !filtros.origens.includes(f.origem)) return false;
    if (filtros.esperas.length && !filtros.esperas.includes(faixaEspera(diasParado(f, agora)))) return false;
    if (filtros.comValor && valorNumerico(f) <= 0) return false;
    if (filtros.responsavel === "sem" && f.assigneeId) return false;
    if (filtros.responsavel && filtros.responsavel !== "sem" && f.assigneeId !== filtros.responsavel) return false;
    if (filtros.janela) {
      const aberta = janela24h(f.ultimaEntradaEm, agora).aberta;
      if (filtros.janela === "aberta" ? !aberta : aberta) return false;
    }
    if (filtros.etiquetas.length) {
      const tem = todasEtiquetas(f, opcoes.nomeSistema);
      if (!filtros.etiquetas.every((e) => tem.includes(e))) return false;
    }
    return true;
  });
}

const PESO_GAVETA: Record<Gaveta, number> = { hoje: 0, parado: 1, follow: 2, manut: 3 };

/**
 * Ordem da lista. "urgencia": gaveta (responder hoje primeiro) e, dentro dela,
 * quem espera há mais tempo; "espera": mais tempo parado primeiro; "valor":
 * maior valor em jogo primeiro; "nome": alfabética.
 */
export function ordenar(fichas: FichaAtivacao[], ordem: Ordem, agora = Date.now()) {
  const nome = (f: FichaAtivacao) => (f.nome || f.telefone || "").toLocaleLowerCase("pt-BR");
  const copia = [...fichas];
  if (ordem === "nome") return copia.sort((a, b) => nome(a).localeCompare(nome(b), "pt-BR"));
  if (ordem === "valor") return copia.sort((a, b) => valorNumerico(b) - valorNumerico(a) || diasParado(b, agora) - diasParado(a, agora));
  if (ordem === "espera") return copia.sort((a, b) => diasParado(b, agora) - diasParado(a, agora));
  return copia.sort((a, b) => {
    const ga = gavetaDe(a, agora);
    const gb = gavetaDe(b, agora);
    const pa = ga ? PESO_GAVETA[ga] : 9;
    const pb = gb ? PESO_GAVETA[gb] : 9;
    return pa - pb || diasParado(b, agora) - diasParado(a, agora);
  });
}

const celula = (v: unknown) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Planilha CSV (separador ";", abre direto no Excel em português). */
export function paraCsv(
  fichas: FichaAtivacao[],
  opcoes: { nomeSistema: string; nomeResponsavel: (id: string | null) => string; tituloGaveta: (g: Gaveta | null) => string; agora?: number },
) {
  const agora = opcoes.agora ?? Date.now();
  const origem = (id: string) => ORIGENS.find((o) => o.id === id)?.rotulo ?? id;
  const linhas = [
    ["nome", "telefone", "gaveta", "parado_dias", "proximo", "resumo", "valor", "origem", "responsavel", "etiquetas"].join(";"),
    ...fichas.map((f) =>
      [
        f.nome ?? "", f.telefone ?? "", opcoes.tituloGaveta(gavetaDe(f, agora)), Math.floor(diasParado(f, agora)),
        f.resumo?.proximo ?? "", f.resumo?.resumo ?? "", valorNumerico(f) ? valorNumerico(f).toFixed(2).replace(".", ",") : "",
        origem(f.origem), opcoes.nomeResponsavel(f.assigneeId), todasEtiquetas(f, opcoes.nomeSistema).join(", "),
      ].map(celula).join(";"),
    ),
  ];
  return "﻿" + linhas.join("\r\n");
}
