import { describe, expect, it } from "vitest";
import { calcularSla, leadsParados } from "./sla";
import type { FichaAtivacao } from "./ativacao";

const AGORA = new Date("2026-11-24T22:00:00-03:00").getTime();
const ha = (min: number) => new Date(AGORA - min * 60_000).toISOString();
const ficha = (id: string, min: number, extra: Partial<FichaAtivacao> = {}): FichaAtivacao => ({
  conversationId: id, contactId: id, nome: id, telefone: null, instagram: null, assigneeId: null,
  ultimaDirecao: "in", ultimaMsgEm: ha(min), ultimoTexto: "", ultimaEntradaEm: ha(min), manutencao: false,
  resolvidaEm: null, textoPaciente: "", audioSemResposta: false, leadEtapa: null, leadOrigem: null, resumo: null, ...extra,
});

describe("calcularSla", () => {
  it("conta quem espera por faixa e ordena do mais antigo", () => {
    const r = calcularSla([
      ficha("a", 5),
      ficha("b", 30, { assigneeId: "u1" }),
      ficha("c", 26 * 60),
      ficha("d", 5 * 24 * 60),
      ficha("e", 90, { ultimaDirecao: "out" }),
    ], AGORA);
    expect(r.aguardando.map((f) => f.conversationId)).toEqual(["d", "c", "b", "a"]);
    expect(r.atrasados).toBe(3);
    expect(r.esquecidos).toBe(2);
    expect(r.perdendo).toBe(1);
    expect(r.semResponsavel).toBe(3);
    expect(r.maisAntigo?.conversationId).toBe("d");
  });

  it("ficha marcada como resolvida depois da última mensagem sai da conta", () => {
    const r = calcularSla([ficha("a", 60, { resolvidaEm: ha(10) })], AGORA);
    expect(r.aguardando).toHaveLength(0);
  });
});

describe("leadsParados", () => {
  it("só conta lead na etapa Novo há mais de 1 h", () => {
    expect(leadsParados([
      { status: "novo", created_at: ha(30) },
      { status: "novo", created_at: ha(120) },
      { status: "em_contato", created_at: ha(600) },
    ], AGORA)).toHaveLength(1);
  });
});
