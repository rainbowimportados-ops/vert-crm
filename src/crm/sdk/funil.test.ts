import { describe, expect, it } from "vitest";
import { etapaDe, nomeDaEtapa, origemDe } from "./funil";
import { matchesFilter } from "../services/conversations";
import type { CrmConversation } from "./types";

describe("origem do lead", () => {
  it("separa landing, cartão digital, WhatsApp e cadastro manual", () => {
    expect(origemDe("site:landing", true)).toBe("landing");
    expect(origemDe("site:digital_card", true)).toBe("digital_card");
    expect(origemDe("WhatsApp", true)).toBe("whatsapp");
    expect(origemDe("Instagram", true)).toBe("manual");
    expect(origemDe(null, false)).toBe("whatsapp");
  });
});

describe("etapa do funil", () => {
  it("usa os status existentes e cai em Novo quando não reconhece", () => {
    expect(nomeDaEtapa("aguardando")).toBe("Negociação");
    expect(nomeDaEtapa("finalizado")).toBe("Ganho");
    expect(etapaDe("perdido")).toBe("perdido");
    expect(etapaDe("qualquer")).toBe("novo");
    expect(etapaDe(null)).toBe("novo");
  });
});

describe("separação por vendedor", () => {
  const conversa = (assigneeId: string | null): CrmConversation => ({
    id: "c1",
    contact: { id: "p1", name: "Ana", phone: "16999990001", avatarUrl: null, city: null, unit: null, patientId: null },
    status: "novo",
    lastMessage: "",
    lastMessageAt: "2026-11-24T12:00:00Z",
    unread: 0,
    primaryTag: null,
    interest: null,
    assigneeId,
    assigneeName: assigneeId ? "Vendedor" : null,
    priority: null,
    isNewLead: true,
    isPatient: false,
  });

  it("Minhas mostra só as conversas do usuário logado", () => {
    expect(matchesFilter(conversa("u1"), "mine", "u1")).toBe(true);
    expect(matchesFilter(conversa("u2"), "mine", "u1")).toBe(false);
    expect(matchesFilter(conversa(null), "mine", "u1")).toBe(false);
  });

  it("Sem responsável mostra só as que ninguém assumiu", () => {
    expect(matchesFilter(conversa(null), "unassigned")).toBe(true);
    expect(matchesFilter(conversa("u1"), "unassigned")).toBe(false);
  });
});
