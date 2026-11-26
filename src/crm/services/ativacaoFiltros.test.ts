import { describe, expect, it } from "vitest";
import type { FichaAtivacao } from "./ativacao";
import {
  aplicarFiltros, contarFiltros, etiquetasDisponiveis, faixaEspera, FILTROS_VAZIOS, ordenar, paraCsv, valorDoTexto, valorNumerico,
} from "./ativacaoFiltros";

const agora = new Date("2026-11-26T18:00:00Z").getTime();
const h = (horas: number) => new Date(agora - horas * 3600_000).toISOString();

const ficha = (p: Partial<FichaAtivacao>): FichaAtivacao => ({
  conversationId: "c1", contactId: "p1", nome: "Ana", telefone: "5516999990001", instagram: null, assigneeId: null,
  ultimaDirecao: "in", ultimaMsgEm: h(5), ultimoTexto: "oi", ultimaEntradaEm: h(5), manutencao: false, resolvidaEm: null,
  textoPaciente: "oi", audioSemResposta: false, leadEtapa: null, leadOrigem: null, resumo: null, clinica: null,
  connectionId: "k1", origem: "direto", tags: [], ...p,
});

const resumo = (etiquetas: string[], valor: string | null = null) => ({ resumo: "r", proximo: "p", etiquetas, valor, baseEm: h(1) });

describe("valor em jogo", () => {
  it("lê o maior valor citado no texto", () => {
    expect(valorDoTexto("R$ 12.850")).toBe(12850);
    expect(valorDoTexto("pede R$ 500 em R$ 800")).toBe(800);
    expect(valorDoTexto("R$ 5,5 mil")).toBe(5500);
    expect(valorDoTexto(null)).toBe(0);
  });
  it("usa o valor aguardando no sistema da clínica primeiro", () => {
    expect(valorNumerico(ficha({ clinica: { status: "ok", aguardando: 3000, aprovado: 0, url: null }, resumo: resumo([], "R$ 9.000") }))).toBe(3000);
    expect(valorNumerico(ficha({ resumo: resumo([], "R$ 9.000") }))).toBe(9000);
  });
});

describe("filtros do quadro", () => {
  const lista = [
    ficha({ conversationId: "a", origem: "google_ads", ultimaMsgEm: h(30), ultimaEntradaEm: h(30), resumo: resumo(["negociando valor", "lentes em resina"], "R$ 12.850") }),
    ficha({ conversationId: "b", origem: "instagram", ultimaMsgEm: h(24 * 10), ultimaEntradaEm: h(24 * 10), assigneeId: "u2", resumo: resumo(["clareamento"]) }),
    ficha({ conversationId: "c", origem: "direto", ultimaMsgEm: h(2), ultimaEntradaEm: h(2), tags: ["VIP"] }),
  ];
  const ids = (xs: FichaAtivacao[]) => xs.map((f) => f.conversationId);
  const filtrar = (p: Partial<typeof FILTROS_VAZIOS>) => ids(aplicarFiltros(lista, { ...FILTROS_VAZIOS, ...p }, { nomeSistema: "Santé", agora }));

  it("sem filtro mostra tudo", () => expect(filtrar({})).toEqual(["a", "b", "c"]));
  it("por origem", () => expect(filtrar({ origens: ["google_ads", "instagram"] })).toEqual(["a", "b"]));
  it("por tempo parado", () => {
    expect(faixaEspera(10)).toBe("8-30");
    expect(filtrar({ esperas: ["8-30"] })).toEqual(["b"]);
  });
  it("por etiqueta (do Claude ou manual), exigindo todas", () => {
    expect(filtrar({ etiquetas: ["lentes em resina"] })).toEqual(["a"]);
    expect(filtrar({ etiquetas: ["VIP"] })).toEqual(["c"]);
    expect(filtrar({ etiquetas: ["lentes em resina", "clareamento"] })).toEqual([]);
  });
  it("com valor, responsável e janela de 24 h", () => {
    expect(filtrar({ comValor: true })).toEqual(["a"]);
    expect(filtrar({ responsavel: "u2" })).toEqual(["b"]);
    expect(filtrar({ responsavel: "sem" })).toEqual(["a", "c"]);
    expect(filtrar({ janela: "aberta" })).toEqual(["c"]);
    expect(filtrar({ janela: "fechada" })).toEqual(["a", "b"]);
  });
  it("conta filtros ativos e lista etiquetas por frequência", () => {
    expect(contarFiltros({ ...FILTROS_VAZIOS, origens: ["site"], comValor: true })).toBe(2);
    const et = etiquetasDisponiveis(lista, "Santé").map((e) => e.texto);
    expect(et).toContain("negociando valor");
    expect(et).toContain("VIP");
    expect(et.some((e) => e.startsWith("R$"))).toBe(false);
  });
  it("ordena por urgência, espera, valor e nome", () => {
    expect(ids(ordenar(lista, "espera", agora))).toEqual(["b", "a", "c"]);
    expect(ids(ordenar(lista, "valor", agora))[0]).toBe("a");
    expect(ids(ordenar(lista, "urgencia", agora))).toEqual(["a", "c", "b"]);
  });
});

describe("exportar", () => {
  it("gera CSV com ; e aspas quando precisa", () => {
    const csv = paraCsv([ficha({ nome: 'Ana "Bia"; Souza', resumo: resumo(["lentes em resina"], "R$ 1.200") })], {
      nomeSistema: "Santé", nomeResponsavel: () => "Suelen", tituloGaveta: () => "Responder hoje", agora,
    });
    const linhas = csv.replace("﻿", "").split("\r\n");
    expect(linhas[0]).toBe("nome;telefone;gaveta;parado_dias;proximo;resumo;valor;origem;responsavel;etiquetas");
    expect(linhas[1]).toContain('"Ana ""Bia""; Souza"');
    expect(linhas[1]).toContain(";1200,00;WhatsApp direto;Suelen;");
  });
});
