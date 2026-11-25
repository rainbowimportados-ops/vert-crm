import { AlarmClock, ArrowRight, Hourglass, UserX, UserPlus, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrmContext } from "../provider/CrmProvider";
import { paraConversa, tempoDeEspera } from "../services/ativacao";
import { ESQUECIDO_H, META_RESPOSTA_MIN, PERDENDO_DIAS, useSla } from "../services/sla";
import { displayName } from "../sdk/phone";
import type { CrmConversation } from "../sdk/types";

/**
 * Faixa "Atendimento agora": quantos pacientes estão esperando resposta, há
 * quanto tempo, e um atalho para responder quem espera há mais tempo.
 */
export function PainelAtendimento({ onOpen, compacto = false }: { onOpen: (c: CrmConversation) => void; compacto?: boolean }) {
  const sla = useSla();
  const { activeConnectionId } = useCrmContext();
  if (sla.carregando) return null;

  const itens = [
    { icon: Hourglass, valor: sla.aguardando.length, rotulo: "aguardando resposta", tom: "neutro" },
    { icon: AlarmClock, valor: sla.atrasados, rotulo: `há mais de ${META_RESPOSTA_MIN} min`, tom: sla.atrasados ? "alerta" : "neutro" },
    { icon: TriangleAlert, valor: sla.esquecidos, rotulo: `esquecidos (+${ESQUECIDO_H} h)`, tom: sla.esquecidos ? "risco" : "neutro" },
    { icon: TriangleAlert, valor: sla.perdendo, rotulo: `perdendo (+${PERDENDO_DIAS} dias)`, tom: sla.perdendo ? "risco" : "neutro" },
    { icon: UserX, valor: sla.semResponsavel, rotulo: "sem responsável", tom: sla.semResponsavel ? "alerta" : "neutro" },
    { icon: UserPlus, valor: sla.leadsParados, rotulo: "leads novos sem contato", tom: sla.leadsParados ? "alerta" : "neutro" },
  ] as const;
  // na lista de conversas só aparece o que pede ação
  const visiveis = compacto ? itens.filter((i) => i.valor > 0 && i.icon !== Hourglass) : itens;
  const tudoEmDia = sla.aguardando.length === 0 && sla.leadsParados === 0;
  const antigo = sla.maisAntigo;
  if (compacto && tudoEmDia) return null;

  return (
    <section
      aria-label="Atendimento agora"
      className={cn(
        "rounded-xl border p-3",
        sla.esquecidos ? "border-destructive/40 bg-destructive/5" : sla.atrasados ? "border-warning/40 bg-warning/5" : "border-border bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {!compacto && <strong className="text-sm">Atendimento agora</strong>}
        {tudoEmDia ? (
          <span className="text-sm text-success">Ninguém esperando resposta.</span>
        ) : (
          visiveis.map((i) => (
            <span key={i.rotulo} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <i.icon className={cn("h-4 w-4", i.tom === "risco" ? "text-destructive" : i.tom === "alerta" ? "text-warning" : "text-muted-foreground")} />
              <b className={cn("tabular-nums", i.tom === "risco" ? "text-destructive" : "text-foreground")}>{i.valor}</b>
              {i.rotulo}
            </span>
          ))
        )}
        {antigo && (
          <button
            onClick={() => onOpen(paraConversa(antigo, activeConnectionId))}
            className={cn(
              "inline-flex h-9 max-w-full items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground",
              !compacto && "ml-auto",
            )}
          >
            <span className="truncate">
              Responder {displayName(antigo.nome ?? "", antigo.telefone ?? "")} · espera há {tempoDeEspera(antigo.ultimaMsgEm)}
            </span>
            <ArrowRight className="h-3.5 w-3.5 flex-none" />
          </button>
        )}
      </div>
    </section>
  );
}
