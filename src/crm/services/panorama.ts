import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

// Panorama das caixas de entrada (RPC crm_panorama): o que pede atenção em
// todas as caixas, de onde vieram as conversas da semana e quem é paciente.

export type Origem = "google_ads" | "meta_ads" | "instagram" | "site" | "direto";

export interface CaixaPanorama {
  id: string;
  display_name: string | null;
  channel: string | null;
  nao_lidas: number;
  hoje: number;
  retomar: number;
  ativar: number;
  manut: number;
}

export interface Panorama {
  gerado_em: string;
  caixas: CaixaPanorama[];
  total: { nao_lidas: number; hoje: number; retomar: number; ativar: number; manut: number };
  origem_7d: Partial<Record<Origem, { novas: number; esperando: number }>>;
  clinica: { pacientes: number; conquistar: number; a_conferir: number; aguardando: number };
}

export const ROTULO_ORIGEM: Record<Origem, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  instagram: "Instagram",
  site: "Site",
  direto: "WhatsApp direto",
};

export const ORDEM_ORIGEM: Origem[] = ["google_ads", "meta_ads", "instagram", "site", "direto"];

export function usePanorama() {
  const { organizationId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-panorama", organizationId],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<Panorama> => {
      const { data, error } = await supabase.rpc("crm_panorama" as never);
      if (error) throw error;
      return data as unknown as Panorama;
    },
  });
}

const n = (v: number, um: string, varios: string) => `${v} ${v === 1 ? um : varios}`;

/**
 * Frase do dia, montada só com os números (sem IA, sempre em dia):
 * o que pede atenção primeiro, depois os anúncios da semana e o sistema da clínica.
 */
export function resumoPanorama(p: Panorama, nomeSistema: string | null): string {
  const partes: string[] = [];
  const { hoje, retomar, ativar } = p.total;
  if (hoje || retomar) {
    const esperando = [
      hoje ? `${n(hoje, "paciente esperando", "pacientes esperando")} resposta` : null,
      retomar ? `${n(retomar, "conversa parada", "conversas paradas")} há mais de 4 dias para retomar` : null,
    ].filter(Boolean).join(" e ");
    partes.push(esperando.charAt(0).toUpperCase() + esperando.slice(1) + ".");
  } else {
    partes.push("Ninguém esperando resposta agora.");
  }
  if (ativar) partes.push(`${n(ativar, "conversa", "conversas")} para ativar (a clínica falou por último).`);

  const anuncios = (["google_ads", "meta_ads"] as Origem[])
    .map((o) => ({ o, d: p.origem_7d[o] }))
    .filter((x) => x.d && x.d.novas > 0);
  if (anuncios.length) {
    const txt = anuncios
      .map(({ o, d }) => `${d!.novas} do ${ROTULO_ORIGEM[o]}${d!.esperando ? ` (${d!.esperando} sem resposta)` : ""}`)
      .join(", ");
    partes.push(`Leads de anúncio na semana: ${txt}.`);
  }

  if (nomeSistema) {
    const { conquistar, a_conferir } = p.clinica;
    if (conquistar) {
      partes.push(`${n(conquistar, "contato ainda não é paciente", "contatos ainda não são pacientes")} no ${nomeSistema}: conquistar.`);
    }
    if (a_conferir) partes.push(`${a_conferir} a conferir no ${nomeSistema}.`);
  }
  return partes.join(" ");
}
