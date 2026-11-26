import { describe, expect, it } from "vitest";
import { estaResolvida, etiquetasDe, gavetaDe, janela24h, resumoEmDia, type FichaAtivacao } from "./ativacao";

const agora = new Date("2026-11-24T18:00:00Z").getTime();
const horasAtras = (h: number) => new Date(agora - h * 3600_000).toISOString();

const ficha = (p: Partial<FichaAtivacao>): FichaAtivacao => ({
  conversationId: "c1",
  contactId: "p1",
  nome: "Ana",
  telefone: "16999990001",
  instagram: null,
  assigneeId: null,
  ultimaDirecao: "in",
  ultimaMsgEm: horasAtras(1),
  ultimoTexto: "oi",
  ultimaEntradaEm: horasAtras(1),
  manutencao: false,
  resolvidaEm: null,
  textoPaciente: "oi",
  audioSemResposta: false,
  leadEtapa: null,
  leadOrigem: null,
  resumo: null,
  clinica: null,
  connectionId: "k1",
  origem: "direto",
  tags: [],
  ...p,
});

describe("gavetas do Ativar pacientes", () => {
  it("paciente falou por último há pouco: responder hoje", () => {
    expect(gavetaDe(ficha({ ultimaMsgEm: horasAtras(30) }), agora)).toBe("hoje");
  });
  it("paciente falou por último há 4+ dias: sem resposta", () => {
    expect(gavetaDe(ficha({ ultimaMsgEm: horasAtras(24 * 5) }), agora)).toBe("parado");
  });
  it("clínica falou por último há até 30 dias: follow-up; depois disso sai do quadro", () => {
    expect(gavetaDe(ficha({ ultimaDirecao: "out", ultimaMsgEm: horasAtras(24 * 10) }), agora)).toBe("follow");
    expect(gavetaDe(ficha({ ultimaDirecao: "out", ultimaMsgEm: horasAtras(24 * 40) }), agora)).toBeNull();
  });
  it("lembrete de manutenção sem resposta vai para manutenção", () => {
    expect(gavetaDe(ficha({ ultimaDirecao: "out", manutencao: true, ultimaMsgEm: horasAtras(24 * 60) }), agora)).toBe("manut");
  });
});

describe("ficha resolvida", () => {
  it("fica resolvida até chegar mensagem nova", () => {
    expect(estaResolvida(ficha({ ultimaMsgEm: horasAtras(5), resolvidaEm: horasAtras(2) }))).toBe(true);
    expect(estaResolvida(ficha({ ultimaMsgEm: horasAtras(1), resolvidaEm: horasAtras(2) }))).toBe(false);
  });
});

describe("janela de 24 h", () => {
  it("abre com a última mensagem do paciente e fecha 24 h depois", () => {
    const aberta = janela24h(horasAtras(20), agora);
    expect(aberta.aberta).toBe(true);
    expect(aberta.restanteMin).toBe(240);
    expect(janela24h(horasAtras(25), agora).aberta).toBe(false);
    expect(janela24h(null, agora).aberta).toBe(false);
  });
});

describe("resumo do cartão", () => {
  const resumo = (baseEm: string) => ({ resumo: "r", proximo: "Ligar", etiquetas: [], valor: null, baseEm });
  it("vale até chegar mensagem nova", () => {
    expect(resumoEmDia(ficha({ ultimaMsgEm: horasAtras(3), resumo: resumo(horasAtras(3)) }))).toBe(true);
    expect(resumoEmDia(ficha({ ultimaMsgEm: horasAtras(1), resumo: resumo(horasAtras(3)) }))).toBe(false);
    expect(resumoEmDia(ficha({}))).toBe(false);
  });
});

describe("etiquetas do cartão", () => {
  const textos = (p: Partial<FichaAtivacao>) => etiquetasDe(ficha(p)).map((e) => e.texto);
  it("lead, áudio e sinais no texto do paciente", () => {
    expect(textos({ leadEtapa: "novo", leadOrigem: "site:landing", audioSemResposta: true })).toEqual(["lead do site", "ouvir áudio"]);
    expect(textos({ textoPaciente: "Oi, estou orçando em outros lugares" })).toContain("risco de perda");
    expect(textos({ textoPaciente: "esse dente não tinha ficado bom" })).toContain("risco de reclamação");
    expect(textos({ leadEtapa: "finalizado" })).toEqual(["cliente"]);
  });
  it("junta as do Claude sem repetir e mostra o valor", () => {
    const f = ficha({
      audioSemResposta: true,
      resumo: { resumo: "r", proximo: "p", etiquetas: ["ouvir áudio", "mais perto de fechar"], valor: "R$ 5.100", baseEm: horasAtras(1) },
    });
    expect(etiquetasDe(f)).toEqual([
      { texto: "ouvir áudio", tom: "neutro" },
      { texto: "mais perto de fechar", tom: "bom" },
      { texto: "R$ 5.100", tom: "valor" },
    ]);
  });
});

describe("etiquetas do sistema da clínica", () => {
  it("mostra 'no Santé' e o valor aguardando quando achou o paciente", () => {
    const t = etiquetasDe(ficha({ clinica: { status: "ok", aguardando: 13800, aprovado: 540, url: null } }), "Santé").map((e) => e.texto);
    expect(t).toContain("no Santé");
    expect(t.some((x) => x.includes("13.800") && x.includes("aguardando"))).toBe(true);
  });
  it("mostra 'lead novo' quando o telefone não está no sistema", () => {
    expect(etiquetasDe(ficha({ clinica: { status: "nao_encontrado", aguardando: 0, aprovado: 0, url: null } }), "Santé").map((e) => e.texto)).toContain("lead novo");
  });
});
