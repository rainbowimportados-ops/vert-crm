import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  MessageSquareText,
  Percent,
  RotateCcw,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useReport } from "../services/reports";
import { formatarDuracao } from "../sdk/duracao";
import { CrmEmpty, CrmPageHeader, CrmStatCard } from "../ui/CrmUi";
import { SkeletonCards, SkeletonText } from "@/components/ui/skeletons";

function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const CORES = ["#985d3a", "#b88664", "#d0aa8d", "#e4d5ca"];

export function ReportsPanel() {
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to] = useState(new Date().toISOString());
  const {
    data: r,
    isError,
    error,
    refetch,
    isFetching,
    isPending,
    fetchStatus,
  } = useReport(from, to);

  const conversion = useMemo(
    () => (r?.contacts_total ? Math.round((r.patients_linked / r.contacts_total) * 100) : 0),
    [r],
  );
  const pie = useMemo(
    () => Object.entries(r?.by_status ?? {}).map(([name, value]) => ({ name, value })),
    [r],
  );

  /**
   * Quatro situações que a versão anterior tratava como uma só, porque a
   * condição era `isLoading || !r`:
   *
   * - consulta desativada por não haver conexão ativa (`enabled` falso): fica
   *   pendente sem nunca buscar, então `isLoading` é falso e `data` é undefined;
   * - erro: `throw` no queryFn deixa `data` undefined e `isLoading` falso;
   * - carregando de fato;
   * - carregou e a RPC devolveu vazio.
   *
   * As três primeiras caíam no ramo do carregamento, e a tela ficava em
   * "Carregando relatório…" para sempre — sem erro, sem explicação, sem saída.
   */
  const semConexao = isPending && fetchStatus === "idle";
  /** `!== "idle"` e não `=== "fetching"` para cobrir também o `paused` de quando o navegador está offline. */
  const carregando = isPending && fetchStatus !== "idle";

  return (
    <div className="w-full space-y-5 p-5 lg:p-8">
      <CrmPageHeader
        title="Relatórios"
        subtitle="Acompanhe o desempenho das suas conversas e equipe."
      >
        <select
          onChange={(e) => setFrom(daysAgoIso(Number(e.target.value)))}
          defaultValue="30"
          aria-label="Período do relatório"
          className="h-11 rounded-lg border border-border bg-white px-4 text-sm"
        >
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </select>
        <button
          onClick={() => window.print()}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-white transition-colors hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          Exportar
        </button>
      </CrmPageHeader>

      {/* As outras quatro abas ainda não têm relatório por trás — estão sendo
          construídas na #81. Até lá continuam desenhadas para não mudar a
          navegação por baixo de quem já se acostumou com ela. */}
      <div className="flex overflow-x-auto rounded-lg border border-border bg-white">
        {["Conversas", "Leads", "Atendentes", "Campanhas", "Conversão"].map((aba, i) => (
          <button
            key={aba}
            className={
              i === 0
                ? "border-b-2 border-primary px-8 py-3 text-sm font-medium"
                : "px-8 py-3 text-sm text-muted-foreground"
            }
          >
            {aba}
          </button>
        ))}
      </div>

      {isError ? (
        <div className="rounded-xl border border-border bg-white p-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-destructive" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium">Não foi possível carregar o relatório</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {(error as Error)?.message ?? "Erro desconhecido ao consultar os dados."}
              </p>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm transition-colors hover:bg-muted disabled:opacity-60"
              >
                <RotateCcw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {isFetching ? "Tentando…" : "Tentar de novo"}
              </button>
            </div>
          </div>
        </div>
      ) : semConexao ? (
        <div className="rounded-xl border border-border bg-white">
          <CrmEmpty
            title="Nenhuma conexão de WhatsApp ativa"
            description="Os relatórios são calculados por conexão. Escolha uma conexão na barra lateral ou conecte um número em Configurações › WhatsApp."
          />
        </div>
      ) : carregando ? (
        <div className="space-y-5" aria-busy="true">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SkeletonCards count={4} height="h-20" />
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.3fr_.9fr]">
            <div className="rounded-xl border border-border bg-white p-5">
              <SkeletonText lines={5} />
            </div>
            <div className="rounded-xl border border-border bg-white p-5">
              <SkeletonText lines={5} />
            </div>
          </div>
        </div>
      ) : !r ? (
        <div className="rounded-xl border border-border bg-white">
          <CrmEmpty
            title="Sem dados no período"
            description="Nenhuma conversa foi registrada nesta conexão dentro do intervalo escolhido. Experimente ampliar o período."
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CrmStatCard
              icon={MessageSquareText}
              label="Conversas Iniciadas"
              value={r.conversations_period}
            />
            <CrmStatCard
              icon={CheckCircle2}
              label="Conversas Respondidas"
              value={r.messages_out}
            />
            <CrmStatCard
              icon={Clock3}
              label="Tempo Médio de Resposta"
              value={formatarDuracao(r.avg_first_response_seconds)}
            />
            <CrmStatCard icon={Percent} label="Taxa de Conversão" value={`${conversion}%`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.3fr_.9fr]">
            <div className="rounded-xl border border-border bg-white p-5">
              <h3 className="text-sm font-medium">Conversas por status</h3>
              <div className="mt-7 space-y-5">
                {pie.map((p, i) => {
                  const max = Math.max(1, ...pie.map((x) => Number(x.value)));
                  return (
                    <div key={p.name}>
                      <div className="mb-2 flex justify-between text-xs">
                        <span className="capitalize">{p.name.replace(/_/g, " ")}</span>
                        <strong>{p.value}</strong>
                      </div>
                      <div className="h-2.5 rounded-full bg-accent">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(Number(p.value) / max) * 100}%`,
                            background: CORES[i % CORES.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative rounded-xl border border-border bg-white p-5">
              <h3 className="text-sm font-medium">Distribuição das conversas</h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={92}
                      paddingAngle={1}
                    >
                      {pie.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-[128px] text-center">
                <strong className="block text-2xl">{r.conversations_total}</strong>
                <small className="text-xs text-muted-foreground">Total</small>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="border-b border-accent px-5 py-4 text-sm font-medium">
              Visão consolidada
            </div>
            <div className="grid grid-cols-2 gap-px bg-accent md:grid-cols-4">
              {[
                { l: "Novos leads", v: r.new_leads },
                { l: "Mensagens recebidas", v: r.messages_in },
                { l: "Follow-ups pendentes", v: r.followups_pending },
                { l: "Campanhas", v: r.campaigns },
                { l: "Contatos", v: r.contacts_total },
                { l: "Pacientes vinculados", v: r.patients_linked },
                { l: "Falhas de envio", v: r.failed_sends },
                { l: "Conversas totais", v: r.conversations_total },
              ].map((x) => (
                <div key={x.l} className="bg-white p-5">
                  <small className="text-xs text-muted-foreground">{x.l}</small>
                  <strong className="mt-1 block text-xl">{x.v}</strong>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
