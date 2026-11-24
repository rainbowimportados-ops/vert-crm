// Datas curtas da tela de Conversas, no fuso do navegador.

/** Hora da última mensagem: "19:14" hoje, "Ontem", dia da semana ou data. */
export function horaDaLista(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dia(agora) - dia(d)) / 86_400_000);
  if (diff <= 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Ontem";
  if (diff < 7) {
    const s = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** "Hoje", "Ontem" ou a data, para o separador entre dias. */
export function rotuloDoDia(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dia(agora) - dia(d)) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff > 1 && diff < 7) {
    const semana = d.toLocaleDateString("pt-BR", { weekday: "long" });
    return semana.charAt(0).toUpperCase() + semana.slice(1);
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d.getFullYear() === agora.getFullYear() ? undefined : "numeric" });
}
