import { describe, expect, it } from "vitest";
import { horaDaLista, rotuloDoDia } from "./datas";

const agora = new Date(2026, 10, 24, 19, 30); // terça, 24/11/2026 19:30 (hora local)

describe("hora na lista de conversas", () => {
  it("hoje mostra a hora; ontem, a palavra; depois, o dia ou a data", () => {
    expect(horaDaLista(new Date(2026, 10, 24, 19, 14).toISOString(), agora)).toBe("19:14");
    expect(horaDaLista(new Date(2026, 10, 23, 8, 0).toISOString(), agora)).toBe("Ontem");
    expect(horaDaLista(new Date(2026, 10, 20, 8, 0).toISOString(), agora)).toMatch(/^Sex/);
    expect(horaDaLista(new Date(2026, 9, 2, 8, 0).toISOString(), agora)).toBe("02/10");
  });
});

describe("separador de dia no chat", () => {
  it("Hoje, Ontem, dia da semana e data", () => {
    expect(rotuloDoDia(new Date(2026, 10, 24, 7, 0).toISOString(), agora)).toBe("Hoje");
    expect(rotuloDoDia(new Date(2026, 10, 23, 22, 0).toISOString(), agora)).toBe("Ontem");
    expect(rotuloDoDia(new Date(2026, 10, 20, 9, 0).toISOString(), agora)).toBe("Sexta-feira");
    expect(rotuloDoDia(new Date(2026, 9, 2, 9, 0).toISOString(), agora)).toBe("02/10");
    expect(rotuloDoDia(new Date(2025, 9, 2, 9, 0).toISOString(), agora)).toBe("02/10/2025");
  });
});
