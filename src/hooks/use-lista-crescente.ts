import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Renderiza uma lista longa por partes: mostra as primeiras e cresce quando a
 * pessoa chega perto do fim.
 *
 * A caixa de entrada do CRM buscava até 300 conversas e montava as 300 no DOM
 * de uma vez, cada uma com avatar, etiquetas e contadores — era isso que fazia
 * a rolagem engasgar. Virtualização de verdade (`@tanstack/react-virtual`)
 * seria melhor, mas não dá para instalar dependência neste projeto hoje: o
 * `xlsx` está declarado como URL de CDN bloqueada, o `npm install` falha e o
 * `package-lock.json` não pode ser regenerado. Isto resolve o problema do DOM
 * pesado sem dependência nova.
 *
 * O `chave` existe porque trocar de filtro ou digitar na busca troca o conteúdo
 * da lista sem trocar a sua identidade: sem ele, o limite herdado da lista
 * anterior esconderia resultados da nova.
 */
export function useListaCrescente<T>(
  itens: T[],
  { passo = 30, chave = "" }: { passo?: number; chave?: string } = {},
) {
  const [limite, setLimite] = useState(passo);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLimite(passo);
    containerRef.current?.scrollTo({ top: 0 });
  }, [chave, passo]);

  const total = itens.length;
  const temMais = limite < total;

  useEffect(() => {
    const sentinela = sentinelaRef.current;
    if (!sentinela || !temMais) return;
    if (typeof IntersectionObserver === "undefined") {
      // Ambiente sem a API (jsdom, navegador antigo): mostra tudo em vez de
      // deixar a pessoa presa nos primeiros itens.
      setLimite(total);
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) {
          setLimite((atual) => Math.min(atual + passo, total));
        }
      },
      // Cresce antes de a sentinela aparecer, para a lista não "acabar" na tela.
      { root: containerRef.current, rootMargin: "600px" },
    );
    observador.observe(sentinela);
    return () => observador.disconnect();
  }, [temMais, total, passo]);

  const visiveis = useMemo(() => itens.slice(0, limite), [itens, limite]);

  return { visiveis, containerRef, sentinelaRef, temMais, total };
}
