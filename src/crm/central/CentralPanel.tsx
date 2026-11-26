import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Check, Clapperboard, Loader2, MessageCircle, RefreshCw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { displayName } from "../sdk/phone";
import { horaDaLista } from "../sdk/datas";
import type { CrmConversation } from "../sdk/types";
import { ROTULO_ORIGEM, type Origem } from "../services/panorama";
import {
  rotuloPrazo, saudacao, situacaoPrazo, useAcoesCentral, useCentral, useResumoDoDia,
  type Compromisso, type ItemConversa,
} from "../services/central";

type Aba = "prioridade" | "prometi" | "retornos" | "sem_dono" | `equipe:${string}`;

type Abrivel = Pick<ItemConversa, "conversation_id" | "connection_id" | "contact_id" | "nome" | "telefone" | "ult_texto" | "ult_em">;

/** Conversa mínima para abrir na tela de Conversas. */
function paraConversa(i: Abrivel): CrmConversation {
  return {
    id: i.conversation_id,
    connectionId: i.connection_id,
    contact: { id: i.contact_id, name: i.nome ?? "", phone: i.telefone ?? "", avatarUrl: null, city: null, unit: null, patientId: null },
    status: "novo",
    lastMessage: i.ult_texto,
    lastMessageAt: i.ult_em,
    unread: 0,
    primaryTag: null,
    interest: null,
    assigneeId: null,
    assigneeName: null,
    priority: null,
    isNewLead: false,
    isPatient: false,
  };
}

const nomeDe = (nome: string | null, telefone: string | null) => displayName(nome, telefone) || "Contato";

function Inicial({ nome }: { nome: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {nome.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** ✓ de um item do plano: responde na hora e grava em seguida. */
function CaixaFeito({ feito, rotulo, onMudar }: { feito: boolean; rotulo: string; onMudar: (v: boolean) => void }) {
  const [marcado, setMarcado] = useState(feito);
  useEffect(() => setMarcado(feito), [feito]);
  return (
    <input
      type="checkbox"
      checked={marcado}
      onChange={(e) => {
        setMarcado(e.target.checked);
        onMudar(e.target.checked);
      }}
      aria-label={rotulo}
      className="mt-1 h-4 w-4 shrink-0 accent-primary"
    />
  );
}

type LinhaConversa = ItemConversa & {
  proximo?: string | null;
  resumo?: string | null;
  gaveta?: string;
  tem_compromisso?: boolean;
  origem?: string;
};

/**
 * Central Organizadora: a tela inicial do CRM. Junta o que pede resposta,
 * o que a clínica prometeu, os retornos combinados com pacientes, os leads
 * que ninguém assumiu e a fila de cada pessoa da equipe.
 */
export function CentralPanel({
  onOpen,
  onAtivacao,
}: {
  onOpen: (conversation: CrmConversation) => void;
  onAtivacao?: () => void;
}) {
  const { data: c, isLoading, error } = useCentral();
  const resumo = useResumoDoDia();
  const [refazendo, setRefazendo] = useState(false);
  const acoes = useAcoesCentral();
  const { fullName } = useAuth();
  const { toast } = useToast();
  const [aba, setAba] = useState<Aba>("prioridade");
  const [atualizando, setAtualizando] = useState(false);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const equipe = useMemo(() => new Map((c?.equipe ?? []).map((e) => [e.id, e.nome])), [c?.equipe]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Organizando o seu dia…</div>;
  if (error || !c) return <div className="p-8 text-sm text-destructive">Não consegui montar a Central agora.</div>;

  const t = c.totais;
  const promessas = c.compromissos.filter((k) => k.tipo === "promessa");
  const retornos = c.compromissos.filter((k) => k.tipo === "retorno");
  const hoje = new Date();
  const dataTopo = hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  const primeiroNome = (fullName ?? "").trim().split(/\s+/)[0];
  const lido = c.whatsapp_lido_em
    ? new Date(c.whatsapp_lido_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : null;

  const pilulas: { id: Aba; rotulo: string; valor: number }[] = [
    { id: "prioridade", rotulo: "Responder", valor: t.responder },
    { id: "prometi", rotulo: "Prometi", valor: t.promessas },
    { id: "retornos", rotulo: "Retornos", valor: t.retornos },
    { id: "sem_dono", rotulo: "Leads sem dono", valor: t.sem_dono },
    ...c.equipe.map((e) => ({ id: `equipe:${e.id}` as Aba, rotulo: e.nome.split(" ")[0], valor: e.pendentes + e.compromissos })),
  ];
  const emDia = pilulas.filter((p) => p.valor === 0).length;

  const atualizar = async () => {
    setAtualizando(true);
    try {
      const r = await acoes.atualizar();
      toast({
        title: r.lidas ? `Li ${r.lidas} conversa${r.lidas === 1 ? "" : "s"}` : "Nada novo para ler",
        description: r.lidas
          ? `${r.novos} compromisso(s) novo(s), ${r.cumpridos} cumprido(s)${r.restam ? ". Ainda há conversas na fila." : "."}`
          : undefined,
      });
    } catch (e) {
      toast({ title: "Não atualizou", description: e instanceof Error ? e.message : "Tente de novo.", variant: "destructive" });
    } finally {
      setAtualizando(false);
    }
  };

  const concluir = async (k: Compromisso, status: "feito" | "descartado") => {
    setConcluindo(k.id);
    try {
      await acoes.concluir(k.id, status);
    } catch {
      toast({ title: "Não deu para marcar agora", variant: "destructive" });
    } finally {
      setConcluindo(null);
    }
  };

  const listaCompromissos = (itens: Compromisso[], vazio: string) =>
    itens.length === 0 ? (
      vazio ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vazio}</p> : null
    ) : (
      <ul className="divide-y divide-border">
        {itens.map((k) => {
          const s = situacaoPrazo(k.prazo);
          const nome = nomeDe(k.nome, k.telefone);
          const dono = k.responsavel_id ? equipe.get(k.responsavel_id) : undefined;
          return (
            <li key={k.id} className="flex items-start gap-3 px-4 py-3">
              <Inicial nome={nome} />
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpen(paraConversa({ ...k, ult_texto: k.texto, ult_em: k.origem_em ?? new Date().toISOString() }))}
              >
                <p className="text-sm font-medium">{k.texto}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{nome}{dono ? ` · ${dono}` : ""}</p>
              </button>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                  s === "vencido" ? "bg-destructive/10 text-destructive" : s === "hoje" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground",
                )}
              >
                {rotuloPrazo(k.prazo)}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => void concluir(k, "feito")}
                  disabled={concluindo === k.id}
                  title="Marcar como feito"
                  aria-label={`Marcar como feito: ${k.texto}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-success hover:text-success disabled:opacity-50"
                >
                  {concluindo === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => void concluir(k, "descartado")}
                  disabled={concluindo === k.id}
                  title="Não vale (descartar)"
                  aria-label={`Descartar: ${k.texto}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );

  const listaConversas = (itens: LinhaConversa[], vazio: string, semDono = false) =>
    itens.length === 0 ? (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vazio}</p>
    ) : (
      <ul className="divide-y divide-border">
        {itens.map((i) => {
          const nome = nomeDe(i.nome, i.telefone);
          return (
            <li key={i.conversation_id}>
              <button onClick={() => onOpen(paraConversa(i))} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40">
                <Inicial nome={nome} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{nome}</span>
                    {i.gaveta === "retomar" && <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">parada há +4 dias</span>}
                    {i.tem_compromisso && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Prometi</span>}
                    {semDono && i.origem && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{ROTULO_ORIGEM[i.origem as Origem] ?? i.origem}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {semDono ? <>ninguém assumiu · “{i.ult_texto}”</> : i.proximo || i.resumo || i.ult_texto}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{horaDaLista(i.ult_em)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );

  const membro = aba.startsWith("equipe:") ? aba.slice(7) : null;
  const tituloLista: Record<string, string> = {
    prioridade: "Para responder",
    prometi: "O que prometi",
    retornos: "Retornos e lembretes",
    sem_dono: "Leads que ninguém assumiu",
  };
  const destaques: { n: number; rotulo: string; sub: string; aba: Aba }[] = [
    { n: t.responder, rotulo: "para responder", sub: `${t.retomar} parada(s) há +4 dias`, aba: "prioridade" },
    { n: t.promessas, rotulo: "promessas abertas", sub: `${t.promessas_vencidas} vencida(s)`, aba: "prometi" },
    { n: t.retornos, rotulo: "retornos combinados", sub: `${t.retornos_hoje} para hoje`, aba: "retornos" },
    { n: t.sem_dono, rotulo: "leads sem dono", sub: "esperando abordagem", aba: "sem_dono" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{dataTopo}</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-.03em] md:text-[34px]">
            {saudacao(hoje)}{primeiroNome ? `, ${primeiroNome}` : ""}.
          </h1>
          <p className="text-sm text-muted-foreground">Aqui está o que o seu dia pede de você.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {lido && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> WhatsApp lido às {lido}
            </span>
          )}
          <button
            onClick={() => void atualizar()}
            disabled={atualizando}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground hover:border-primary disabled:opacity-60"
          >
            {atualizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar agora
          </button>
        </div>
      </div>

      <section aria-label="Resumo da Central" className="mt-5 rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:w-64">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] opacity-75">Sua central</p>
            <p className="text-xl font-semibold">Central Vert</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs opacity-80">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Lendo o WhatsApp{lido ? ` · atualizada às ${lido}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => c.prioridade[0] && onOpen(paraConversa(c.prioridade[0]))}
                disabled={!c.prioridade.length}
                className="inline-flex items-center gap-1 rounded-full bg-primary-foreground px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-60"
              >
                Próximo: responder <ArrowRight className="h-3.5 w-3.5" />
              </button>
              {onAtivacao && (
                <button onClick={onAtivacao} className="rounded-full border border-primary-foreground/40 px-3 py-1.5 text-xs font-medium hover:bg-primary-foreground/10">
                  Abrir Ativar pacientes
                </button>
              )}
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
            {destaques.map((s) => (
              <button key={s.rotulo} onClick={() => setAba(s.aba)} className="rounded-xl p-2 text-left hover:bg-primary-foreground/10">
                <span className="block text-3xl font-semibold tabular-nums">{s.n}</span>
                <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-80">{s.rotulo}</span>
                <span className="block text-[11px] opacity-70">{s.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Plano do dia" className="mt-4 rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Plano do dia</h2>
              {resumo.data && (
                <span className="text-[11px] text-muted-foreground">
                  feito às {new Date(resumo.data.gerado_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{resumo.data.plano.filter((p) => p.feito).length} de {resumo.data.plano.length} feitos
                </span>
              )}
              <button
                onClick={async () => {
                  setRefazendo(true);
                  try {
                    await resumo.atualizar();
                  } catch (e) {
                    toast({ title: "Não atualizou o plano", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
                  } finally {
                    setRefazendo(false);
                  }
                }}
                disabled={refazendo || resumo.isLoading}
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                {refazendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar plano
              </button>
            </div>
            {resumo.isLoading || refazendo ? (
              <p className="mt-2 text-sm text-muted-foreground">O Claude está montando o seu dia…</p>
            ) : resumo.error ? (
              <p className="mt-2 text-sm text-muted-foreground">{resumo.error instanceof Error ? resumo.error.message : "O plano do dia não saiu agora."}</p>
            ) : resumo.data ? (
              <>
                <p className="mt-1 text-[15px] leading-snug">{resumo.data.foco}</p>
                <ol className="mt-3 space-y-1.5">
                  {resumo.data.plano.map((p, i) => {
                    const alvo = p.conversation_id
                      ? c.prioridade.find((x) => x.conversation_id === p.conversation_id)
                        ?? c.sem_dono.find((x) => x.conversation_id === p.conversation_id)
                      : undefined;
                    const compromisso = !alvo && p.conversation_id ? c.compromissos.find((k) => k.conversation_id === p.conversation_id) : undefined;
                    const abrir = alvo
                      ? () => onOpen(paraConversa(alvo))
                      : compromisso
                        ? () => onOpen(paraConversa({ ...compromisso, ult_texto: compromisso.texto, ult_em: compromisso.origem_em ?? new Date().toISOString() }))
                        : undefined;
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        <CaixaFeito
                          feito={p.feito}
                          rotulo={`Feito: ${p.acao}`}
                          onMudar={(v) => resumo.marcar(i, v).catch(() => toast({ title: "Não deu para marcar agora", variant: "destructive" }))}
                        />
                        <span className={cn("min-w-0 flex-1 text-sm", p.feito && "text-muted-foreground line-through")}>
                          {abrir ? (
                            <button onClick={abrir} className="text-left font-medium hover:text-primary hover:underline">{p.acao}</button>
                          ) : (
                            <span className="font-medium">{p.acao}</span>
                          )}
                          {p.motivo && <span className="block text-xs text-muted-foreground">{p.motivo}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mt-5">
        <p className="mb-2 text-xs text-muted-foreground">
          Seu dia · <b className="text-foreground">{emDia} de {pilulas.length}</b> em dia
        </p>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filas do dia">
          {pilulas.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={aba === p.id}
              onClick={() => setAba(p.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                aba === p.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : p.valor === 0
                    ? "border-border text-muted-foreground"
                    : "border-primary/30 bg-primary/5 text-primary",
              )}
            >
              {p.valor === 0 ? <Check className="h-3.5 w-3.5" /> : <b className="tabular-nums">{p.valor}</b>} {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label={membro ? "Fila da pessoa" : tituloLista[aba]}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{membro ? `Com ${equipe.get(membro) ?? "a equipe"}` : tituloLista[aba]}</h2>
            {aba === "prioridade" && onAtivacao && (
              <button onClick={onAtivacao} className="text-xs text-muted-foreground hover:text-foreground">Ver no quadro ›</button>
            )}
          </div>
          {aba === "prioridade" && listaConversas(c.prioridade, "Ninguém esperando resposta agora.")}
          {aba === "prometi" && listaCompromissos(promessas, "Nenhuma promessa aberta.")}
          {aba === "retornos" && listaCompromissos(retornos, "Nenhum retorno combinado em aberto.")}
          {aba === "sem_dono" && listaConversas(c.sem_dono, "Todo lead novo já tem alguém cuidando.", true)}
          {membro && (
            <>
              {listaConversas(c.prioridade.filter((i) => i.assignee_id === membro), "Nada para responder.")}
              <div className="border-t border-border">{listaCompromissos(c.compromissos.filter((k) => k.responsavel_id === membro), "")}</div>
            </>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> Agenda de hoje</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              As consultas do dia vêm do Santé assim que o login estiver salvo e testado em Configurações → Sistema da clínica.
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-4" aria-label="Sugestões para gravar hoje">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Clapperboard className="h-4 w-4 text-primary" /> Sugestões para gravar hoje</h2>
            {resumo.data?.ideias.length ? (
              <ul className="mt-2 space-y-3">
                {resumo.data.ideias.map((ideia, i) => (
                  <li key={i}>
                    <p className="text-sm font-medium leading-snug">{ideia.titulo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ideia.roteiro}</p>
                    {ideia.frase && <p className="mt-1 text-[11px] italic text-muted-foreground">Veio do WhatsApp: “{ideia.frase}”</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {resumo.isLoading ? "Procurando as dúvidas que mais aparecem…" : "Sem dúvidas repetidas nos últimos dias."}
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" /> Equipe</h2>
            {c.equipe.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Ninguém com conversa atribuída ainda. A conversa passa a ser de quem responder pelo CRM.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {c.equipe.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => setAba(`equipe:${e.id}`)} className="flex w-full items-center justify-between gap-2 text-left text-xs hover:text-primary">
                      <span className="truncate">{e.nome}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{e.pendentes} responder · {e.compromissos} compromissos</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            O Claude lê as conversas novas e anota o que a clínica prometeu e os retornos combinados com os pacientes. O que ele vir cumprido sai sozinho; você também pode marcar ✓.
          </p>
        </aside>
      </div>
    </div>
  );
}
