/**
 * Segundos em hh:mm:ss, para os tempos médios dos relatórios.
 *
 * A versão anterior, embutida no ReportsPanel, escrevia a hora como o literal
 * "00" e os minutos nunca transbordavam para ela — 90 minutos saíam como
 * "00:90:00". E como o valor é uma média, `sec % 60` sem arredondar chegava a
 * imprimir fração de segundo.
 *
 * Mora aqui, junto dos outros helpers puros do CRM, para poder ser testado sem
 * arrastar o cliente do Supabase nem a biblioteca de gráficos.
 */
export function formatarDuracao(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return "—";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
