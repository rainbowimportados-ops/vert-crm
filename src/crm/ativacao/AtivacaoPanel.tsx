import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckSquare, Columns3, Copy, Download, ExternalLink, List, Loader2, MessageSquare, Search, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCrmContext } from "../provider/CrmProvider";
import { useMessages } from "../services/conversations";
import { useSendMessage } from "../services/sendMessage";
import {
  GAVETAS,
  RESUMOS_POR_PEDIDO,
  escreverMensagem,
  estaResolvida,
  etiquetasDe,
  gavetaDe,
  janela24h,
  resumirFichas,
  resumoEmDia,
  sugerirCaminhos,
  tempoDeEspera,
  useAtivacaoLista,
  useMarcarResolvida,
  type FichaAtivacao,
  type Gaveta,
  type Etiqueta,
  type Sugestao,
  type TipoMensagem,
} from "../services/ativacao";
import { ROTEIRO_PADRAO, TIPOS, lerRoteiros, salvarRoteiros } from "./roteiros";
import { maskPhone } from "../sdk/phone";
import { useAssignableUsers } from "../services/atendimento";
import { FILTROS_VAZIOS, aplicarFiltros, ordenar, paraCsv, type FiltrosAtivacao, type Ordem } from "../services/ativacaoFiltros";
import { baixarArquivo } from "../services/ativacaoMassa";
import { BarraEmMassa, BarraFiltros, FilaMensagens, ListaFichas, ResumoFiltros, nomeDaFicha } from "./Organizador";
import { OrcamentosClinica } from "../clinica/OrcamentosClinica";
import { reaisCurto, useSistemaClinica } from "../services/clinica";
import type { CrmConversation } from "../sdk/types";

function lerLocal(chave: string, padrao: string) {
  try {
    return localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao;
  }
}
function gravarLocal(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento */
  }
}

/** Conversa mínima para abrir a ficha na tela de Conversas. */
function paraConversa(f: FichaAtivacao, connectionId: string | null): CrmConversation {
  return {
    id: f.conversationId,
    connectionId: f.connectionId ?? connectionId,
    contact: { id: f.contactId, name: f.nome ?? "", phone: f.telefone ?? "", avatarUrl: null, city: null, unit: null, patientId: null },
    status: "novo",
    lastMessage: f.ultimoTexto,
    lastMessageAt: f.ultimaMsgEm,
    unread: 0,
    primaryTag: null,
    interest: null,
    assigneeId: f.assigneeId,
    assigneeName: null,
    priority: null,
    isNewLead: false,
    isPatient: false,
  };
}

/** Quadro "Ativar pacientes": fichas em quatro gavetas e, ao abrir uma, conversa + IA + envio. */
export function AtivacaoPanel({ onOpen }: { onOpen: (conversation: CrmConversation) => void }) {
  const [todasCaixas, setTodasCaixas] = useState(() => lerLocal("vert-crm-ativacao-caixas", "caixa") === "todas");
  const { data: fichas, isLoading, error } = useAtivacaoLista(todasCaixas);
  const { activeConnectionId, activeConnection, connections } = useCrmContext();
  const { data: usuarios = [] } = useAssignableUsers();
  const [busca, setBusca] = useState("");
  const [ocultar, setOcultar] = useState(true);
  const [gavetaMobile, setGavetaMobile] = useState<Gaveta>("hoje");
  const [aberta, setAberta] = useState<FichaAtivacao | null>(null);
  const [visao, setVisao] = useState<"quadro" | "lista">(() => (lerLocal("vert-crm-ativacao-visao", "quadro") === "lista" ? "lista" : "quadro"));
  const [filtros, setFiltros] = useState<FiltrosAtivacao>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordem>("urgencia");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [selecionando, setSelecionando] = useState(false);
  const [fila, setFila] = useState<FichaAtivacao[] | null>(null);
  const { data: sistema } = useSistemaClinica();
  const nomeSistema = sistema?.nome ?? "sistema";

  useEffect(() => { gravarLocal("vert-crm-ativacao-caixas", todasCaixas ? "todas" : "caixa"); }, [todasCaixas]);
  useEffect(() => { gravarLocal("vert-crm-ativacao-visao", visao); }, [visao]);

  // base do quadro: só conversas que caem numa gaveta, com busca e filtros aplicados
  const daGaveta = useMemo(() => (fichas ?? []).filter((f) => gavetaDe(f) && !(ocultar && estaResolvida(f))), [fichas, ocultar]);
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    const porBusca = !q ? daGaveta : daGaveta.filter((f) => {
      const alvo = [
        f.nome, f.instagram, f.ultimoTexto, f.resumo?.resumo, f.resumo?.proximo,
        etiquetasDe(f, nomeSistema, 99).map((e) => e.texto).join(" "),
      ].join(" ").toLowerCase();
      return alvo.includes(q) || (!!digitos && (f.telefone ?? "").includes(digitos));
    });
    return ordenar(aplicarFiltros(porBusca, filtros, { nomeSistema }), ordem);
  }, [daGaveta, busca, filtros, ordem, nomeSistema]);

  const porGaveta = useMemo(() => {
    const out: Record<Gaveta, FichaAtivacao[]> = { hoje: [], parado: [], follow: [], manut: [] };
    filtradas.forEach((f) => out[gavetaDe(f)!].push(f));
    if (ordem !== "urgencia") return out;
    // mais urgente primeiro: quem espera há mais tempo nas gavetas do paciente, o mais recente no resto
    out.hoje.sort((a, b) => a.ultimaMsgEm.localeCompare(b.ultimaMsgEm));
    out.parado.sort((a, b) => b.ultimaMsgEm.localeCompare(a.ultimaMsgEm));
    out.follow.sort((a, b) => b.ultimaMsgEm.localeCompare(a.ultimaMsgEm));
    out.manut.sort((a, b) => b.ultimaMsgEm.localeCompare(a.ultimaMsgEm));
    return out;
  }, [filtradas, ordem]);

  // seleção: some quem saiu da lista (filtro, resolvido, recarga)
  useEffect(() => {
    setSelecionadas((s) => {
      if (!s.size) return s;
      const visiveis = new Set(filtradas.map((f) => f.conversationId));
      const nova = new Set([...s].filter((id) => visiveis.has(id)));
      return nova.size === s.size ? s : nova;
    });
  }, [filtradas]);
  const fichasSelecionadas = useMemo(() => filtradas.filter((f) => selecionadas.has(f.conversationId)), [filtradas, selecionadas]);
  const alternarSelecao = (id: string) =>
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const alternarTodas = () =>
    setSelecionadas((s) => (filtradas.every((f) => s.has(f.conversationId)) ? new Set() : new Set(filtradas.map((f) => f.conversationId))));
  const limparSelecao = () => {
    setSelecionadas(new Set());
    setSelecionando(false);
  };

  const nomeResponsavel = (id: string | null) => (id ? usuarios.find((u) => u.id === id)?.name ?? "" : "");
  const caixaDe = (id: string | null) => connections.find((c) => c.id === id);
  const oficialDe = (f: FichaAtivacao) => {
    const c = caixaDe(f.connectionId) ?? activeConnection;
    return c?.provider === "zernio" && (c?.channel ?? "whatsapp") === "whatsapp";
  };
  const exportar = (lista: FichaAtivacao[]) => {
    const csv = paraCsv(lista, {
      nomeSistema,
      nomeResponsavel,
      tituloGaveta: (g) => GAVETAS.find((x) => x.id === g)?.titulo ?? "",
    });
    baixarArquivo(`ativar-pacientes-${new Date().toLocaleDateString("en-CA")}.csv`, csv);
  };

  // mantém a ficha aberta em dia quando a lista recarrega
  useEffect(() => {
    if (!aberta || !fichas) return;
    const nova = fichas.find((f) => f.conversationId === aberta.conversationId);
    if (nova && nova !== aberta) setAberta(nova);
  }, [fichas, aberta]);

  const totalAguardando = useMemo(
    () => Object.values(porGaveta).flat().filter((f) => !estaResolvida(f)).reduce((t, f) => t + (f.clinica?.aguardando ?? 0), 0),
    [porGaveta],
  );

  // Resumos do Claude: a gaveta "Responder hoje" se resume sozinha; as outras
  // têm um botão. Cada conversa é pedida no máximo uma vez por abertura da tela,
  // e a edge function só gasta com quem recebeu mensagem depois do último resumo.
  const qc = useQueryClient();
  const pedidos = useRef(new Set<string>());
  const [resumindo, setResumindo] = useState<Gaveta | null>(null);
  const [avisoResumo, setAvisoResumo] = useState<string | null>(null);
  const semResumo = (g: Gaveta) =>
    porGaveta[g].filter((f) => !estaResolvida(f) && !resumoEmDia(f) && !pedidos.current.has(f.conversationId));

  const resumir = async (g: Gaveta, automatico = false) => {
    const alvo = semResumo(g).slice(0, RESUMOS_POR_PEDIDO);
    if (!alvo.length || resumindo) return;
    alvo.forEach((f) => pedidos.current.add(f.conversationId));
    setResumindo(g);
    setAvisoResumo(null);
    try {
      const r = await resumirFichas(alvo.map((f) => f.conversationId));
      if (r.aviso) setAvisoResumo(r.aviso);
      await qc.invalidateQueries({ queryKey: ["crm-ativacao", activeConnectionId] });
    } catch (e) {
      // automático: falha silenciosa no cartão, aviso discreto no topo
      setAvisoResumo(e instanceof Error ? e.message : "Os resumos não vieram agora.");
      if (!automatico) alvo.forEach((f) => pedidos.current.delete(f.conversationId));
    } finally {
      setResumindo(null);
    }
  };

  const pendentesHoje = isLoading ? 0 : semResumo("hoje").length;
  useEffect(() => {
    if (pendentesHoje > 0 && !resumindo && !busca) void resumir("hoje", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendentesHoje, resumindo, busca]);

  useEffect(() => {
    pedidos.current.clear();
  }, [activeConnectionId]);

  return (
    <div className="w-full space-y-4 p-5 lg:p-8">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ativar pacientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conversas {todasCaixas ? "de todas as caixas" : `do painel ${activeConnection?.displayName ?? ""}`} que pedem retorno, separadas por urgência. O Claude lê a conversa, sugere caminhos e escreve a mensagem; nada sai sem você confirmar.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {GAVETAS.map((g) => (
            <span key={g.id} className="text-sm text-muted-foreground">
              <b className="mr-1 text-lg font-semibold text-foreground tabular-nums">{porGaveta[g.id].length}</b>
              {g.titulo.toLowerCase()}
            </span>
          ))}
          {totalAguardando > 0 && (
            <span className="text-sm text-muted-foreground">
              <b className="mr-1 text-lg font-semibold text-foreground tabular-nums">{reaisCurto(totalAguardando)}</b>
              em orçamentos aguardando no {nomeSistema}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome, telefone ou assunto"
              aria-label="Buscar"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          {connections.length > 1 && (
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Caixas">
              <button onClick={() => setTodasCaixas(false)} aria-pressed={!todasCaixas} className={cn("rounded-md px-2.5 py-1.5", !todasCaixas ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                Esta caixa
              </button>
              <button onClick={() => setTodasCaixas(true)} aria-pressed={todasCaixas} className={cn("rounded-md px-2.5 py-1.5", todasCaixas ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                Todas as caixas
              </button>
            </div>
          )}
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Visão">
            <button onClick={() => setVisao("quadro")} aria-pressed={visao === "quadro"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1.5", visao === "quadro" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              <Columns3 className="h-3.5 w-3.5" /> Quadro
            </button>
            <button onClick={() => setVisao("lista")} aria-pressed={visao === "lista"} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1.5", visao === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              <List className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
          {visao === "quadro" && (
            <button
              onClick={() => (selecionando ? limparSelecao() : setSelecionando(true))}
              aria-pressed={selecionando}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium", selecionando ? "border-primary text-foreground" : "border-border text-muted-foreground hover:border-primary")}
            >
              <CheckSquare className="h-3.5 w-3.5" /> {selecionando ? "Sair da seleção" : "Selecionar"}
            </button>
          )}
          <button onClick={() => exportar(filtradas)} disabled={!filtradas.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:border-primary disabled:opacity-40" title="Baixa a lista filtrada em planilha">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={ocultar} onChange={(e) => setOcultar(e.target.checked)} />
            Ocultar resolvidos
          </label>
        </div>
        <BarraFiltros fichas={daGaveta} filtros={filtros} onFiltros={setFiltros} ordem={ordem} onOrdem={setOrdem} nomeSistema={nomeSistema} usuarios={usuarios} />
        <ResumoFiltros filtros={filtros} onFiltros={setFiltros} usuarios={usuarios} />
        {filtradas.length !== daGaveta.length && (
          <p className="text-xs text-muted-foreground">
            Mostrando <b className="text-foreground">{filtradas.length}</b> de {daGaveta.length} conversas.
          </p>
        )}
        {avisoResumo && <p className="text-xs text-destructive">Resumos do Claude: {avisoResumo}</p>}
        {selecionadas.size > 0 && (
          <BarraEmMassa
            selecionadas={fichasSelecionadas}
            totalFiltradas={filtradas.length}
            onSelecionarFiltradas={() => setSelecionadas(new Set(filtradas.map((f) => f.conversationId)))}
            onLimpar={limparSelecao}
            onFila={() => setFila(fichasSelecionadas.filter((f) => !estaResolvida(f)))}
            onExportar={() => exportar(fichasSelecionadas)}
            usuarios={usuarios}
          />
        )}
        <div className={cn("flex gap-2 overflow-x-auto md:hidden", visao === "lista" && "hidden")}>
          {GAVETAS.map((g) => (
            <button
              key={g.id}
              onClick={() => setGavetaMobile(g.id)}
              aria-pressed={gavetaMobile === g.id}
              className={cn(
                "flex-none rounded-full border px-3 py-1.5 text-xs",
                gavetaMobile === g.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
              )}
            >
              {g.titulo} · {porGaveta[g.id].length}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : error ? (
        <p className="text-sm text-destructive">Não foi possível carregar as conversas.</p>
      ) : visao === "lista" ? (
        <ListaFichas
          fichas={filtradas}
          selecionadas={selecionadas}
          onAlternar={alternarSelecao}
          onAlternarTodas={alternarTodas}
          onAbrir={setAberta}
          nomeResponsavel={nomeResponsavel}
          nomeCaixa={todasCaixas ? (id) => caixaDe(id)?.displayName ?? "" : null}
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {GAVETAS.map((g) => (
            <section key={g.id} className={cn(g.id === gavetaMobile ? "block" : "hidden md:block")}>
              <h2 className="text-base font-semibold">{g.titulo}</h2>
              <p className="mb-2 text-xs text-muted-foreground">{g.sub} · {porGaveta[g.id].length}</p>
              <BotaoResumir
                pendentes={semResumo(g.id).length}
                ocupado={resumindo === g.id}
                automatico={g.id === "hoje"}
                onClick={() => void resumir(g.id)}
              />
              <div className="space-y-2">
                {porGaveta[g.id].length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Nada aqui.</p>
                ) : (
                  porGaveta[g.id].slice(0, 80).map((f) => (
                    <FichaCard
                      key={f.conversationId}
                      ficha={f}
                      gaveta={g.id}
                      resumindo={resumindo === g.id && !resumoEmDia(f) && pedidos.current.has(f.conversationId)}
                      nomeSistema={nomeSistema}
                      onAbrir={() => setAberta(f)}
                      selecionavel={selecionando || selecionadas.size > 0}
                      selecionada={selecionadas.has(f.conversationId)}
                      onSelecionar={() => alternarSelecao(f.conversationId)}
                    />
                  ))
                )}
                {porGaveta[g.id].length > 80 && (
                  <p className="text-center text-xs text-muted-foreground">+{porGaveta[g.id].length - 80}: use a busca para achar os demais.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {aberta && (
        <PainelFicha
          key={aberta.conversationId}
          ficha={aberta}
          oficial={oficialDe(aberta)}
          onFechar={() => setAberta(null)}
          onAbrirConversa={() => onOpen(paraConversa(aberta, activeConnectionId))}
        />
      )}
      {fila && (
        <FilaMensagens
          fichas={fila}
          oficialDe={oficialDe}
          onFechar={() => {
            setFila(null);
            limparSelecao();
          }}
        />
      )}
    </div>
  );
}

function BotaoResumir({
  pendentes,
  ocupado,
  automatico,
  onClick,
}: {
  pendentes: number;
  ocupado: boolean;
  automatico: boolean;
  onClick: () => void;
}) {
  if (ocupado)
    return (
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Claude resumindo os cartões…
      </p>
    );
  if (!pendentes) return <div className="mb-3" />;
  return (
    <button
      onClick={onClick}
      className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
    >
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      {automatico ? "Resumir os que faltam" : "Resumir com Claude"} ({Math.min(pendentes, RESUMOS_POR_PEDIDO)}
      {pendentes > RESUMOS_POR_PEDIDO ? ` de ${pendentes}` : ""})
    </button>
  );
}

const TOM_ETIQUETA: Record<Etiqueta["tom"], string> = {
  risco: "border-destructive/60 text-destructive",
  bom: "border-success/60 text-success",
  valor: "border-primary/60 font-semibold text-foreground",
  neutro: "border-border text-muted-foreground",
};

function FichaCard({
  ficha: f,
  gaveta,
  resumindo,
  nomeSistema,
  onAbrir,
  selecionavel = false,
  selecionada = false,
  onSelecionar,
}: {
  ficha: FichaAtivacao;
  gaveta: Gaveta;
  resumindo: boolean;
  nomeSistema: string;
  onAbrir: () => void;
  selecionavel?: boolean;
  selecionada?: boolean;
  onSelecionar?: () => void;
}) {
  const resolvida = estaResolvida(f);
  const urgente = gaveta === "parado" || (gaveta === "hoje" && Date.now() - new Date(f.ultimaMsgEm).getTime() > 12 * 3600_000);
  const etiquetas = etiquetasDe(f, nomeSistema);
  // resumo antigo ainda ajuda; o cartão avisa que chegou mensagem depois dele
  const resumo = f.resumo;
  const desatualizado = !!resumo && !resumoEmDia(f);
  return (
    <article
      className={cn("rounded-xl border bg-card p-3", selecionada ? "border-primary ring-1 ring-primary" : "border-border", resolvida && "opacity-50", selecionavel && "cursor-pointer")}
      onClick={selecionavel ? onSelecionar : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        {selecionavel && (
          <input
            type="checkbox"
            checked={selecionada}
            onChange={onSelecionar}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Selecionar ${nomeDaFicha(f)}`}
            className="mt-1 flex-none"
          />
        )}
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-semibold">{nomeDaFicha(f)}</strong>
          <span className="block truncate text-xs text-muted-foreground">
            {f.telefone ? maskPhone(f.telefone) : f.instagram ? "Instagram" : ""}
          </span>
        </div>
        <div className="flex-none text-right">
          <b className={cn("block text-sm tabular-nums", urgente ? "text-destructive" : "text-foreground")}>{tempoDeEspera(f.ultimaMsgEm)}</b>
          <span className="text-[10px] text-muted-foreground">{f.ultimaDirecao === "in" ? "esperando" : "sem resposta"}</span>
        </div>
      </div>
      {resumo ? (
        <>
          <p className="mt-2 text-xs text-foreground/85">{resumo.resumo}</p>
          {resumo.proximo && (
            <p className="mt-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium">{resumo.proximo}</p>
          )}
          {desatualizado && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {resumindo ? "Atualizando com a mensagem nova…" : "Chegou mensagem depois deste resumo."}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 line-clamp-3 text-xs text-foreground/80">
          <span className="text-muted-foreground">{f.ultimaDirecao === "in" ? "Paciente: " : "Clínica: "}</span>
          {f.ultimoTexto || "(mídia)"}
          {resumindo && <span className="mt-1 block text-[10px] text-muted-foreground">Claude resumindo…</span>}
        </p>
      )}
      {etiquetas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {etiquetas.map((e) => (
            <span key={e.texto} className={cn("rounded-full border px-2 py-0.5 text-[10px] leading-4", TOM_ETIQUETA[e.tom])}>
              {e.texto}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAbrir();
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Abrir ficha
        </button>
        {resolvida && <span className="ml-auto text-[11px] text-success">resolvido</span>}
      </div>
    </article>
  );
}

export function PainelFicha({
  ficha: f,
  oficial,
  onFechar,
  onAbrirConversa,
}: {
  ficha: FichaAtivacao;
  oficial: boolean;
  onFechar: () => void;
  onAbrirConversa: () => void;
}) {
  const { toast } = useToast();
  const mensagens = useMessages(f.conversationId);
  const enviar = useSendMessage();
  const marcar = useMarcarResolvida();
  const [roteiros, setRoteiros] = useState(lerRoteiros);
  const [tipo, setTipo] = useState<TipoMensagem>(f.ultimaDirecao === "in" ? "negociacao" : "ativacao");
  const [extra, setExtra] = useState("");
  const [assina, setAssina] = useState(() => lerLocal("vert-crm-assina", "Júlia"));
  const [texto, setTexto] = useState(() => lerLocal(`vert-crm-rascunho-${f.conversationId}`, ""));
  // caminhos e envio ficam guardados por conversa: reabrir a ficha não perde o trabalho
  const chaveCaminhos = `vert-crm-caminhos-${f.conversationId}`;
  const chaveEnvio = `vert-crm-enviado-${f.conversationId}`;
  const [sugestao, setSugestao] = useState<Sugestao | null>(() => {
    try {
      const salvo = JSON.parse(lerLocal(chaveCaminhos, "null"));
      // só vale se nenhuma mensagem chegou depois
      return salvo && salvo.base === f.ultimaMsgEm ? (salvo.sugestao as Sugestao) : null;
    } catch {
      return null;
    }
  });
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [enviadoEm, setEnviadoEm] = useState<string | null>(() => lerLocal(chaveEnvio, "") || null);
  const [ocupado, setOcupado] = useState<"caminhos" | "escrever" | "enviar" | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const resolvida = estaResolvida(f);
  const j = janela24h(f.ultimaEntradaEm);
  const podeEnviar = !!texto.trim() && (!oficial || j.aberta);

  useEffect(() => { gravarLocal(`vert-crm-rascunho-${f.conversationId}`, texto); }, [f.conversationId, texto]);
  useEffect(() => { gravarLocal("vert-crm-assina", assina); }, [assina]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  const falha = (e: unknown) =>
    toast({ title: e instanceof Error ? e.message : "Não deu agora. Tente de novo.", variant: "destructive" });

  const pedirCaminhos = async () => {
    setOcupado("caminhos");
    try {
      const nova = await sugerirCaminhos(f.conversationId, roteiros);
      setSugestao(nova);
      setEscolhido(null);
      gravarLocal(chaveCaminhos, JSON.stringify({ base: f.ultimaMsgEm, sugestao: nova }));
    } catch (e) {
      falha(e);
    } finally {
      setOcupado(null);
    }
  };

  const escrever = async (o?: { tipo: TipoMensagem; extra: string }) => {
    setOcupado("escrever");
    try {
      setTexto(await escreverMensagem({ conversationId: f.conversationId, tipo: o?.tipo ?? tipo, roteiros, extra: o?.extra ?? extra, assina }));
      setConfirmando(false);
    } catch (e) {
      falha(e);
    } finally {
      setOcupado(null);
    }
  };

  const confirmarEnvio = async () => {
    setOcupado("enviar");
    try {
      await enviar(f.conversationId, texto.trim());
      const agora = new Date().toISOString();
      gravarLocal(chaveEnvio, agora);
      setEnviadoEm(agora);
      toast({ title: "Mensagem enviada" });
      setTexto("");
      setConfirmando(false);
      // enviou: a ficha sai da fila até o paciente responder
      if (!resolvida) await marcar(f.conversationId, true).catch(() => undefined);
    } catch (e) {
      falha(e);
    } finally {
      setOcupado(null);
    }
  };

  const digitos = (f.telefone ?? "").replace(/\D/g, "");
  const linkWhats = digitos
    ? `https://wa.me/${digitos.length <= 11 ? "55" : ""}${digitos}?text=${encodeURIComponent(texto)}`
    : null;

  const alterarRoteiro = (valor: string) => {
    const novo = { ...roteiros, [tipo]: valor };
    setRoteiros(novo);
    salvarRoteiros(novo);
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/40" onClick={onFechar}>
      <aside
        role="dialog"
        aria-label={`Ficha de ${nomeDaFicha(f)}`}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[880px] overflow-y-auto bg-background p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{nomeDaFicha(f)}</h2>
            <p className="text-sm text-muted-foreground">
              {f.telefone ? maskPhone(f.telefone) : f.instagram ? `Instagram @${f.instagram}` : ""}
              {" · "}última mensagem há {tempoDeEspera(f.ultimaMsgEm)}
            </p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-border">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Conversa recente</h3>
              <button onClick={onAbrirConversa} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <MessageSquare className="h-3.5 w-3.5" /> Abrir em Conversas
              </button>
            </div>
            <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto rounded-xl bg-muted/60 p-3">
              {mensagens.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Carregando…</p>
              ) : (
                mensagens.slice(-30).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[88%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed",
                      m.direction === "out" ? "self-end bg-primary/10" : "self-start bg-card",
                    )}
                  >
                    <small className="block text-[10px] text-muted-foreground">
                      {m.direction === "out" ? "Clínica" : "Paciente"} · {new Date(m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </small>
                    {m.content || (m.type !== "text" ? `[${m.type}]` : "")}
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 rounded-xl border border-border bg-card p-3">
              <OrcamentosClinica contactId={f.contactId} />
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <section>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Rumo da conversa</h3>
                <button
                  onClick={() => void pedirCaminhos()}
                  disabled={ocupado !== null}
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
                >
                  {ocupado === "caminhos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Sugerir caminhos
                </button>
              </div>
              {ocupado === "caminhos" && <p className="mt-2 text-xs text-muted-foreground">Lendo a conversa…</p>}
              {sugestao && (
                <div className="mt-2 space-y-2">
                  <div className="rounded-lg bg-muted/60 p-3 text-sm">
                    {sugestao.resumo}
                    {sugestao.etapa && <p className="mt-1 text-xs"><b>Etapa:</b> {sugestao.etapa}</p>}
                    {(sugestao.classificacao || sugestao.temperatura) && (
                      <p className="mt-1 text-xs">
                        <b>Classificação:</b> {sugestao.classificacao ?? "—"}
                        {sugestao.temperatura && <> · <b>Temperatura:</b> <span className={cn(sugestao.temperatura === "quente" ? "text-destructive" : sugestao.temperatura === "morna" ? "text-warning" : "text-muted-foreground")}>{sugestao.temperatura}</span></>}
                      </p>
                    )}
                    {sugestao.objecao && sugestao.objecao !== "nenhuma" && <p className="mt-1 text-xs"><b>Objeção:</b> {sugestao.objecao}</p>}
                    {sugestao.aprovacao_necessaria && !/^n[ãa]o\b/i.test(sugestao.aprovacao_necessaria) && (
                      <p className="mt-1 text-xs text-destructive"><b>Precisa de aprovação:</b> {sugestao.aprovacao_necessaria}</p>
                    )}
                    {(sugestao.pendencias?.length ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground"><b>A validar:</b> {sugestao.pendencias!.join("; ")}</p>
                    )}
                  </div>
                  {sugestao.caminhos.map((c, i) => (
                    <div key={i} className={cn("rounded-lg border p-3", escolhido === i ? "border-primary ring-1 ring-primary" : "border-border")}>
                      <h4 className="text-sm font-semibold">{c.titulo}</h4>
                      <p className="mt-1 text-xs">{c.quando}</p>
                      {c.perguntas.length > 0 && <p className="mt-1 text-xs"><b>Gancho:</b> {c.perguntas.join(" / ")}</p>}
                      {c.fechamento && <p className="mt-1 text-xs"><b>Fechamento:</b> {c.fechamento}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">Risco: {c.risco}</p>
                      <button
                        onClick={() => {
                          setEscolhido(i);
                          setTipo(c.tipo);
                          setExtra(c.instrucao);
                          void escrever({ tipo: c.tipo, extra: c.instrucao });
                        }}
                        disabled={ocupado !== null}
                        className="mt-2 inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs hover:border-primary"
                      >
                        {ocupado === "escrever" && escolhido === i ? "Escrevendo…" : "Usar este caminho"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold">Mensagem</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTipo(t.id)}
                    aria-pressed={tipo === t.id}
                    className={cn(
                      "h-8 rounded-lg border px-3 text-xs",
                      tipo === t.id ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">Como o Claude conduz este tipo (roteiro editável)</summary>
                <textarea
                  value={roteiros[tipo]}
                  onChange={(e) => alterarRoteiro(e.target.value)}
                  aria-label="Roteiro"
                  className="mt-2 min-h-[180px] w-full rounded-lg border border-border bg-card p-2 text-xs"
                />
                <button onClick={() => alterarRoteiro(ROTEIRO_PADRAO[tipo])} className="mt-1 text-xs text-primary hover:underline">
                  Restaurar padrão
                </button>
                <span className="ml-2 text-[11px] text-muted-foreground">Vale para todos os pacientes, neste navegador.</span>
              </details>
              <label className="mt-3 block text-xs text-muted-foreground">
                Instrução extra (opcional): condição que você pode oferecer, horário, valor, tom
                <input
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder="Ex.: manter o valor em até 18x; quinta 14h ou sexta 9h"
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                />
              </label>
              <label className="mt-2 block text-xs text-muted-foreground">
                Assina como
                <input
                  value={assina}
                  onChange={(e) => setAssina(e.target.value)}
                  placeholder="Ex.: Júlia"
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                />
              </label>
              <button
                onClick={() => void escrever()}
                disabled={ocupado !== null}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary disabled:opacity-60"
              >
                {ocupado === "escrever" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                Escrever com Claude
              </button>
              <textarea
                value={texto}
                onChange={(e) => { setTexto(e.target.value); setConfirmando(false); }}
                aria-label="Mensagem"
                placeholder="A mensagem aparece aqui. Você pode editar antes de enviar."
                className="mt-2 min-h-[160px] w-full rounded-lg border border-border bg-card p-3 text-sm"
              />
              {oficial && (
                <p className={cn("mt-1 rounded-md bg-muted/60 px-2 py-1.5 text-xs", !j.aberta && "text-destructive")}>
                  {j.aberta
                    ? `Janela de 24h aberta: dá para enviar mensagem livre por mais ${j.restanteMin >= 60 ? `${Math.floor(j.restanteMin / 60)} h ${j.restanteMin % 60} min` : `${j.restanteMin} min`}.`
                    : "Janela de 24h fechada: o WhatsApp oficial só aceita modelo aprovado. Use \"Abrir no WhatsApp\" pelo celular."}
                </p>
              )}

              {confirmando ? (
                <div className="mt-3 rounded-lg border border-primary p-3">
                  <p className="text-sm font-semibold">Enviar pelo WhatsApp da clínica?</p>
                  <p className="text-xs text-muted-foreground">Para {nomeDaFicha(f)}</p>
                  <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-2 text-sm">{texto}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => void confirmarEnvio()}
                      disabled={ocupado !== null}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {ocupado === "enviar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Confirmar envio
                    </button>
                    <button onClick={() => setConfirmando(false)} className="h-9 rounded-lg border border-border px-3 text-xs">Voltar</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => setConfirmando(true)}
                    disabled={!podeEnviar || ocupado !== null}
                    title={oficial && !j.aberta ? "Fora da janela de 24h" : undefined}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" /> Enviar agora
                  </button>
                  <button
                    onClick={() => { void navigator.clipboard?.writeText(texto); toast({ title: "Copiado" }); }}
                    disabled={!texto.trim()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </button>
                  {linkWhats && (
                    <a href={linkWhats} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs">
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir no WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => void marcar(f.conversationId, !resolvida).catch(falha)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs"
                  >
                    <Check className="h-3.5 w-3.5" /> {resolvida ? "Reabrir" : "Marcar resolvido"}
                  </button>
                </div>
              )}
              {enviadoEm && (
                <p className="mt-2 text-xs text-success">
                  Enviado por aqui em {new Date(enviadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">A mensagem só sai quando você confirma, pelo número deste painel.</p>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
