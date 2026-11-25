import { describe, expect, it } from "vitest";
import { resumoPanorama, type Panorama } from "./panorama";

const base = (p: Partial<Panorama> = {}): Panorama => ({
  gerado_em: "2026-11-25T03:00:00Z",
  caixas: [],
  total: { nao_lidas: 0, hoje: 0, retomar: 0, ativar: 0, manut: 0 },
  origem_7d: {},
  clinica: { pacientes: 0, conquistar: 0, a_conferir: 0, aguardando: 0 },
  ...p,
});

describe("frase do panorama", () => {
  it("começa pelo que pede atenção: responder e retomar", () => {
    const t = resumoPanorama(base({ total: { nao_lidas: 5, hoje: 3, retomar: 1, ativar: 12, manut: 0 } }), null);
    expect(t).toBe("3 pacientes esperando resposta e 1 conversa parada há mais de 4 dias para retomar. 12 conversas para ativar (a clínica falou por último).");
  });

  it("diz quando ninguém está esperando", () => {
    expect(resumoPanorama(base(), null)).toBe("Ninguém esperando resposta agora.");
  });

  it("mostra leads de anúncio da semana e quem está sem resposta", () => {
    const t = resumoPanorama(base({ origem_7d: { google_ads: { novas: 2, esperando: 1 }, meta_ads: { novas: 1, esperando: 0 }, direto: { novas: 30, esperando: 4 } } }), null);
    expect(t).toContain("Leads de anúncio na semana: 2 do Google Ads (1 sem resposta), 1 do Meta Ads.");
    expect(t).not.toContain("WhatsApp direto");
  });

  it("com o sistema da clínica ligado, conta quem conquistar e quem falta conferir", () => {
    const t = resumoPanorama(base({ clinica: { pacientes: 10, conquistar: 4, a_conferir: 7, aguardando: 0 } }), "Santé");
    expect(t).toContain("4 contatos ainda não são pacientes no Santé: conquistar.");
    expect(t).toContain("7 a conferir no Santé.");
    expect(resumoPanorama(base({ clinica: { pacientes: 0, conquistar: 4, a_conferir: 7, aguardando: 0 } }), null)).not.toContain("Santé");
  });
});
