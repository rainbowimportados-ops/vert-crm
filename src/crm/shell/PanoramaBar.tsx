import { useState } from "react";
import { ChevronDown, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORDEM_ORIGEM, ROTULO_ORIGEM, resumoPanorama, usePanorama } from "../services/panorama";
import { reaisCurto, useSistemaClinica } from "../services/clinica";

function lerAberto() {
  try {
    return localStorage.getItem("vert-crm-panorama-aberto") === "1";
  } catch {
    return false;
  }
}

/**
 * Linha do topo: resumo de todas as caixas de entrada, atualizado a cada minuto.
 * Os números que pedem ação levam ao quadro Ativar pacientes.
 */
export function PanoramaBar({ onAtivacao }: { onAtivacao?: () => void }) {
  const { data: p } = usePanorama();
  const { data: sistema } = useSistemaClinica();
  const [aberto, setAberto] = useState(lerAberto);
  if (!p) return null;
  const nomeSistema = sistema?.ativo ? sistema.nome : null;

  const alternar = () => {
    setAberto((v) => {
      try {
        localStorage.setItem("vert-crm-panorama-aberto", v ? "0" : "1");
      } catch {
        /* sem armazenamento: só não lembra */
      }
      return !v;
    });
  };

  const chips: { rotulo: string; valor: number; tom: "risco" | "alerta" | "neutro" }[] = [
    { rotulo: "responder hoje", valor: p.total.hoje, tom: "risco" },
    { rotulo: "retomar", valor: p.total.retomar, tom: "alerta" },
    { rotulo: "ativar", valor: p.total.ativar, tom: "neutro" },
    { rotulo: "manutenção", valor: p.total.manut, tom: "neutro" },
  ];

  return (
    <section aria-label="Panorama das caixas de entrada" className="border-b border-border bg-card px-4 py-2.5 md:px-6">
      <div className="flex items-start gap-3">
        <Gauge className="mt-0.5 hidden h-4 w-4 shrink-0 text-primary sm:block" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-card-foreground">{resumoPanorama(p, nomeSistema)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <button
                key={c.rotulo}
                onClick={onAtivacao}
                disabled={!onAtivacao}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs disabled:cursor-default",
                  c.valor && c.tom === "risco"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : c.valor && c.tom === "alerta"
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-border text-muted-foreground",
                )}
              >
                <b className="tabular-nums">{c.valor}</b> {c.rotulo}
              </button>
            ))}
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
              <b className="tabular-nums">{p.total.nao_lidas}</b> não lidas
            </span>
            {nomeSistema && p.clinica.aguardando > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                <b className="tabular-nums">{reaisCurto(p.clinica.aguardando)}</b> aguardando no {nomeSistema}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={alternar}
          aria-expanded={aberto}
          aria-label={aberto ? "Esconder detalhes do panorama" : "Ver detalhes do panorama"}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="hidden sm:inline">{aberto ? "Menos" : "Detalhes"}</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
        </button>
      </div>

      {aberto && (
        <div className="mt-3 grid gap-4 pb-1 md:grid-cols-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Por caixa de entrada</p>
            <ul className="space-y-1">
              {p.caixas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                  <span className="truncate">{c.display_name ?? "Caixa"}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <b className={cn(c.hoje ? "text-destructive" : "")}>{c.hoje}</b> hoje ·{" "}
                    <b className={cn(c.retomar ? "text-warning" : "")}>{c.retomar}</b> retomar · {c.ativar} ativar · {c.nao_lidas} não lidas
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conversas novas nos últimos 7 dias</p>
            <ul className="space-y-1">
              {ORDEM_ORIGEM.map((o) => {
                const d = p.origem_7d[o];
                return (
                  <li key={o} className="flex items-baseline justify-between gap-2 text-xs">
                    <span>{ROTULO_ORIGEM[o]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <b className="text-card-foreground">{d?.novas ?? 0}</b>
                      {d?.esperando ? <span className="text-destructive"> · {d.esperando} sem resposta</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[10px] text-muted-foreground">Google e Meta Ads pelos códigos do anúncio no link da landing page.</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              No sistema da clínica{nomeSistema ? ` (${nomeSistema})` : ""}
            </p>
            {nomeSistema ? (
              <ul className="space-y-1 text-xs">
                <li className="flex justify-between gap-2"><span>Já são pacientes</span><b className="tabular-nums">{p.clinica.pacientes}</b></li>
                <li className="flex justify-between gap-2"><span>Não são pacientes: conquistar</span><b className="tabular-nums text-primary">{p.clinica.conquistar}</b></li>
                <li className="flex justify-between gap-2"><span>A conferir (o CRM confere sozinho a cada 15 min)</span><b className="tabular-nums">{p.clinica.a_conferir}</b></li>
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ligue o Santé ou outro sistema em Configurações → Sistema da clínica para saber quem já é paciente.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
