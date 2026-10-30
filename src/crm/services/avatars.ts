import { supabase } from "@/integrations/supabase/client";

// Fotos de perfil dos contatos.
//
// O banco guarda uma referencia interna "wa-pics:<caminho>" apontando para o
// bucket privado whatsapp-pics. Nunca guardamos a URL da CDN do WhatsApp
// (pps.whatsapp.net): ela vem assinada com validade de poucos dias e depois
// disso a foto aparece quebrada na tela.
//
// Aqui trocamos a referencia por uma URL assinada de 1 hora, em lote e com
// cache em memoria, para a lista de conversas nao pedir uma assinatura por
// contato a cada renderizacao.

const BUCKET = "whatsapp-pics";
const PREFIXO = "wa-pics:";
const VALIDADE_SEGUNDOS = 3600;
const REAPROVEITA_ATE_MS = 55 * 60 * 1000;

const cache = new Map<string, { url: string; validaAte: number }>();

function caminhoDe(referencia: string | null | undefined): string | null {
  return referencia?.startsWith(PREFIXO) ? referencia.slice(PREFIXO.length) : null;
}

/**
 * Recebe as referencias na ordem em que aparecem na lista e devolve, na mesma
 * ordem, a URL pronta para o <img>. Valores que nao sao referencia interna
 * (null ou uma URL http qualquer) voltam intactos.
 */
export async function resolverAvatares(referencias: (string | null)[]): Promise<(string | null)[]> {
  const agora = Date.now();
  const pendentes = new Set<string>();

  for (const referencia of referencias) {
    const caminho = caminhoDe(referencia);
    if (!caminho) continue;
    const guardado = cache.get(caminho);
    if (!guardado || guardado.validaAte <= agora) pendentes.add(caminho);
  }

  if (pendentes.size) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls([...pendentes], VALIDADE_SEGUNDOS);
    for (const item of data ?? []) {
      if (item?.path && item?.signedUrl) {
        cache.set(item.path, { url: item.signedUrl, validaAte: agora + REAPROVEITA_ATE_MS });
      }
    }
  }

  return referencias.map((referencia) => {
    const caminho = caminhoDe(referencia);
    if (!caminho) return referencia ?? null;
    return cache.get(caminho)?.url ?? null;
  });
}

/** Esquece as URLs assinadas — usar depois de sincronizar as fotos. */
export function limparCacheDeAvatares() {
  cache.clear();
}
