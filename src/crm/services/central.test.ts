import { describe, expect, it } from "vitest";
import { rotuloPrazo, saudacao, situacaoPrazo } from "./central";

describe("prazos da Central", () => {
  it("classifica vencido, hoje, futuro e sem prazo", () => {
    expect(situacaoPrazo("2026-11-25", "2026-11-26")).toBe("vencido");
    expect(situacaoPrazo("2026-11-26", "2026-11-26")).toBe("hoje");
    expect(situacaoPrazo("2026-12-01", "2026-11-26")).toBe("futuro");
    expect(situacaoPrazo(null, "2026-11-26")).toBe("sem_prazo");
  });
  it("escreve o prazo do jeito da recepção", () => {
    expect(rotuloPrazo("2026-11-25", "2026-11-26")).toBe("venceu 25/11");
    expect(rotuloPrazo("2026-11-26", "2026-11-26")).toBe("hoje");
    expect(rotuloPrazo("2026-12-01", "2026-11-26")).toBe("até 01/12");
    expect(rotuloPrazo(null, "2026-11-26")).toBe("sem prazo");
  });
});

describe("saudação pelo horário de São Paulo", () => {
  it("bom dia, boa tarde e boa noite", () => {
    expect(saudacao(new Date("2026-11-26T11:00:00Z"))).toBe("Bom dia"); // 8h em SP
    expect(saudacao(new Date("2026-11-26T17:00:00Z"))).toBe("Boa tarde"); // 14h
    expect(saudacao(new Date("2026-11-26T23:30:00Z"))).toBe("Boa noite"); // 20h30
  });
});
