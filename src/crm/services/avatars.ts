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
const emAndamento = new Map<string, Promise<void>>();

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

  // Caminhos que já estão sendo assinados por outra chamada não são pedidos de
  // novo: a lista recarrega a cada mensagem e, com o storage lento, as
  // assinaturas se acumulavam e travavam as outras consultas da tela.
  const esperar: Promise<void>[] = [];
  const novos: string[] = [];
  for (const caminho of pendentes) {
    const voando = emAndamento.get(caminho);
    if (voando) esperar.push(voando);
    else novos.push(caminho);
  }
  if (novos.length) {
    const pedido = (async () => {
      try {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(novos, VALIDADE_SEGUNDOS);
        for (const item of data ?? []) {
          if (item?.path && item?.signedUrl) {
            cache.set(item.path, { url: item.signedUrl, validaAte: Date.now() + REAPROVEITA_ATE_MS });
          }
        }
      } catch {
        /* sem foto: a lista mostra as iniciais */
      } finally {
        novos.forEach((c) => emAndamento.delete(c));
      }
    })();
    novos.forEach((c) => emAndamento.set(c, pedido));
    esperar.push(pedido);
  }
  // a lista não espera mais que 3 s pelas fotos; as que chegarem depois
  // aparecem no próximo recarregamento
  if (esperar.length) await Promise.race([Promise.all(esperar), new Promise((r) => setTimeout(r, 3000))]);

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
