import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeletons compartilhados — design-system/MASTER.md §2: "shimmer nos formatos
 * reais do conteúdo (nunca spinner de página inteira >300ms)".
 *
 * A regra que faz isso funcionar não é o shimmer, é a **forma**: o skeleton
 * ocupa a mesma altura e as mesmas colunas do que vai chegar, para que a página
 * não mude de layout quando os dados chegam. Um bloco cinza de altura arbitrária
 * cumpre a letra da regra e erra o objetivo — a tela ainda salta.
 *
 * O shimmer para sozinho sob `prefers-reduced-motion` (regra global no
 * index.css); nenhum skeleton precisa tratar isso.
 */

/** Linhas de texto com larguras irregulares — texto real não é retangular. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  const larguras = ["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4"];
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", larguras[i % larguras.length])} />
      ))}
    </div>
  );
}

/**
 * Linhas de listagem na altura real da linha da tabela. `columns` reproduz a
 * grade do cabeçalho — passe a mesma string de `grid-template-columns` que a
 * tabela usa e as colunas do skeleton caem debaixo dos títulos certos.
 */
export function SkeletonRows({
  rows = 5,
  columns,
  className,
}: {
  rows?: number;
  columns?: string;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border/60", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn("gap-3 px-4 py-3", columns ? "hidden sm:grid" : "flex items-center")}
          style={columns ? { gridTemplateColumns: columns } : undefined}
        >
          {columns ? (
            columns
              .trim()
              .split(/\s+/)
              .map((_col, c) => <Skeleton key={c} className="h-5" />)
          ) : (
            <Skeleton className="h-5 w-full" />
          )}
        </div>
      ))}
      {/* Sem colunas definidas o mobile também precisa de linha. */}
      {columns
        ? Array.from({ length: rows }).map((_, i) => (
            <div key={`m${i}`} className="sm:hidden px-4 py-3">
              <Skeleton className="h-5 w-full" />
            </div>
          ))
        : null}
    </div>
  );
}

/** Cartões na altura real do cartão que substituem. */
export function SkeletonCards({
  count = 3,
  height = "h-40",
  className,
}: {
  count?: number;
  height?: string;
  className?: string;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("card-premium p-5", className)} aria-hidden="true">
          <div className={cn("flex flex-col gap-3", height)}>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Esqueleto de página inteira, para o fallback de rota. Reproduz o que toda
 * página do sistema tem — título, ação primária, faixa de indicadores e um
 * bloco de conteúdo — em vez de um anel girando num fundo vazio.
 */
export function SkeletonPage() {
  return (
    <div className="w-full space-y-5 p-4 sm:p-6" aria-busy="true" aria-label="Carregando a página">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-11 w-40 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-premium space-y-3 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>

      <div className="card-premium overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <Skeleton className="h-3 w-40" />
        </div>
        <SkeletonRows rows={6} />
      </div>
    </div>
  );
}
