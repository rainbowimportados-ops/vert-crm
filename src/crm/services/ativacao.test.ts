import { describe, expect, it } from "vitest";
import { estaResolvida, gavetaDe, janela24h, type FichaAtivacao } from "./ativacao";

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
