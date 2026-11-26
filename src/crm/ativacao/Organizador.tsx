import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight, Bookmark, CalendarClock, Check, ChevronDown, Download, Loader2, RefreshCw, Send, SkipForward,
  Sparkles, Tag, Trash2, UserRound, X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSendMessage } from "../services/sendMessage";
import { useTags } from "../services/atendimento";
import {
  GAVETAS, escreverMensagem, estaResolvida, gavetaDe, janela24h, tempoDeEspera,
  type FichaAtivacao, type TipoMensagem,
} from "../services/ativacao";
import {
  FAIXAS, FILTROS_VAZIOS, ORIGENS, contarFiltros, diasParado, etiquetasDisponiveis, valorNumerico,
  type FaixaEspera, type FiltrosAtivacao, type Ordem,
} from "../services/ativacaoFiltros";
import {
  gravarFiltrosSalvos, lerFiltrosSalvos, useAcoesEmMassa, type FiltroSalvo,
} from "../services/ativacaoMassa";
import { TIPOS, lerRoteiros } from "./roteiros";
import { displayName, maskPhone } from "../sdk/phone";
import { reaisCurto } from "../services/clinica";

export function nomeDaFicha(f: FichaAtivacao) {
  if (f.instagram && (!f.nome || f.nome === "Instagram")) return `@${f.instagram}`;
  return displayName(f.nome ?? "", f.telefone ?? "");
}

export const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: "urgencia", rotulo: "Urgência" },
  { id: "espera", rotulo: "Mais tempo parado" },
  { id: "valor", rotulo: "Maior valor" },
  { id: "nome", rotulo: "Nome (A-Z)" },
];

const rotuloOrigem = (id: string) => ORIGENS.find((o) => o.id === id)?.rotulo ?? id;
const hojeSP = (somaDias = 0) => new Date(Date.now() + somaDias * 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// ---------- peças pequenas ----------

function Chip({ rotulo, ativos, children, largura = "w-64" }: { rotulo: string; ativos: number; children: ReactNode; largura?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-medium",
            ativos ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary",
          )}
        >
          {rotulo}
          {ativos > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{ativos}</span>}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("z-[120] max-h-80 overflow-y-auto p-2", largura)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function Opcao({ marcado, onClick, children, extra }: { marcado: boolean; onClick: () => void; children: ReactNode; extra?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      role="menuitemcheckbox"
      aria-checked={marcado}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
    >
      <span className={cn("flex h-4 w-4 flex-none items-center justify-center rounded border", marcado ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
        {marcado && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {extra !== undefined && <span className="text-[10px] text-muted-foreground">{extra}</span>}
    </button>
  );
}

const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

// ---------- barra de filtros ----------

export function BarraFiltros({
  fichas,
  filtros,
  onFiltros,
  ordem,
  onOrdem,
  nomeSistema,
  usuarios,
}: {
  fichas: FichaAtivacao[];
  filtros: FiltrosAtivacao;
  onFiltros: (f: FiltrosAtivacao) => void;
  ordem: Ordem;
  onOrdem: (o: Ordem) => void;
  nomeSistema: string;
  usuarios: { id: string; name: string }[];
}) {
  const etiquetas = useMemo(() => etiquetasDisponiveis(fichas, nomeSistema), [fichas, nomeSistema]);
  const contaOrigem = useMemo(() => {
    const m = new Map<string, number>();
    fichas.forEach((f) => m.set(f.origem, (m.get(f.origem) ?? 0) + 1));
    return m;
  }, [fichas]);
  const [salvos, setSalvos] = useState<FiltroSalvo[]>(lerFiltrosSalvos);
  const [nomeNovo, setNomeNovo] = useState("");
  const ativos = contarFiltros(filtros);
  const set = (p: Partial<FiltrosAtivacao>) => onFiltros({ ...filtros, ...p });

  const salvar = () => {
    const nome = nomeNovo.trim();
    if (!nome) return;
    const lista = [...salvos.filter((s) => s.nome !== nome), { nome, filtros, ordem }];
    setSalvos(lista);
    gravarFiltrosSalvos(lista);
    setNomeNovo("");
  };
  const apagar = (nome: string) => {
    const lista = salvos.filter((s) => s.nome !== nome);
    setSalvos(lista);
    gravarFiltrosSalvos(lista);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros">
      <Chip rotulo="Etiqueta e assunto" ativos={filtros.etiquetas.length} largura="w-72">
        {etiquetas.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">Sem etiquetas ainda. Os resumos do Claude criam as de assunto.</p>
        ) : (
          etiquetas.map((e) => (
            <Opcao key={e.texto} marcado={filtros.etiquetas.includes(e.texto)} onClick={() => set({ etiquetas: alternar(filtros.etiquetas, e.texto) })} extra={e.n}>
              {e.texto}
            </Opcao>
          ))
        )}
      </Chip>
      <Chip rotulo="Origem" ativos={filtros.origens.length}>
        {ORIGENS.map((o) => (
          <Opcao key={o.id} marcado={filtros.origens.includes(o.id)} onClick={() => set({ origens: alternar(filtros.origens, o.id) })} extra={contaOrigem.get(o.id) ?? 0}>
            {o.rotulo}
          </Opcao>
        ))}
      </Chip>
      <Chip rotulo="Tempo parado e valor" ativos={filtros.esperas.length + (filtros.comValor ? 1 : 0)}>
        {FAIXAS.map((fx) => (
          <Opcao key={fx.id} marcado={filtros.esperas.includes(fx.id)} onClick={() => set({ esperas: alternar<FaixaEspera>(filtros.esperas, fx.id) })}>
            Parado {fx.rotulo}
          </Opcao>
        ))}
        <div className="my-1 border-t border-border" />
        <Opcao marcado={filtros.comValor} onClick={() => set({ comValor: !filtros.comValor })}>
          Com valor em jogo (orçamento ou R$ citado)
        </Opcao>
      </Chip>
      <Chip rotulo="Responsável e janela" ativos={(filtros.responsavel ? 1 : 0) + (filtros.janela ? 1 : 0)}>
        <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Responsável</p>
        <Opcao marcado={filtros.responsavel === "sem"} onClick={() => set({ responsavel: filtros.responsavel === "sem" ? "" : "sem" })}>
          Sem responsável
        </Opcao>
        {usuarios.map((u) => (
          <Opcao key={u.id} marcado={filtros.responsavel === u.id} onClick={() => set({ responsavel: filtros.responsavel === u.id ? "" : u.id })}>
            {u.name}
          </Opcao>
        ))}
        <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase text-muted-foreground">Janela de 24 h do WhatsApp</p>
        <Opcao marcado={filtros.janela === "aberta"} onClick={() => set({ janela: filtros.janela === "aberta" ? "" : "aberta" })}>
          Aberta (dá para mandar texto livre)
        </Opcao>
        <Opcao marcado={filtros.janela === "fechada"} onClick={() => set({ janela: filtros.janela === "fechada" ? "" : "fechada" })}>
          Fechada (API oficial só com modelo)
        </Opcao>
      </Chip>

      <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2 text-xs text-muted-foreground">
        Ordenar
        <select value={ordem} onChange={(e) => onOrdem(e.target.value as Ordem)} className="bg-transparent text-xs font-medium text-foreground outline-none" aria-label="Ordenar">
          {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
        </select>
      </label>

      <Chip rotulo="Filtros salvos" ativos={0} largura="w-72">
        {salvos.length === 0 && <p className="p-2 text-xs text-muted-foreground">Monte um filtro e dê um nome para usar de novo.</p>}
        {salvos.map((s) => (
          <div key={s.nome} className="flex items-center gap-1">
            <button
              onClick={() => { onFiltros(s.filtros); onOrdem(s.ordem); }}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <Bookmark className="h-3.5 w-3.5 flex-none text-primary" />
              <span className="truncate">{s.nome}</span>
            </button>
            <button onClick={() => apagar(s.nome)} aria-label={`Apagar ${s.nome}`} className="rounded p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="mt-2 flex gap-1 border-t border-border pt-2">
          <input
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
            placeholder={ativos ? "Nome do filtro atual" : "Escolha filtros antes"}
            aria-label="Nome do filtro"
            disabled={!ativos}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
          />
          <button onClick={salvar} disabled={!ativos || !nomeNovo.trim()} className="h-8 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-40">
            Salvar
          </button>
        </div>
      </Chip>

      {ativos > 0 && (
        <button onClick={() => onFiltros(FILTROS_VAZIOS)} className="inline-flex h-9 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" /> Limpar filtros
        </button>
      )}
    </div>
  );
}

/** Filtros que estão valendo, cada um com um X para tirar. */
export function ResumoFiltros({ filtros, onFiltros, usuarios }: { filtros: FiltrosAtivacao; onFiltros: (f: FiltrosAtivacao) => void; usuarios: { id: string; name: string }[] }) {
  const itens: { texto: string; tirar: () => void }[] = [
    ...filtros.etiquetas.map((e) => ({ texto: e, tirar: () => onFiltros({ ...filtros, etiquetas: filtros.etiquetas.filter((x) => x !== e) }) })),
    ...filtros.origens.map((o) => ({ texto: rotuloOrigem(o), tirar: () => onFiltros({ ...filtros, origens: filtros.origens.filter((x) => x !== o) }) })),
    ...filtros.esperas.map((fx) => ({ texto: `parado ${FAIXAS.find((x) => x.id === fx)?.rotulo}`, tirar: () => onFiltros({ ...filtros, esperas: filtros.esperas.filter((x) => x !== fx) }) })),
    ...(filtros.comValor ? [{ texto: "com valor", tirar: () => onFiltros({ ...filtros, comValor: false }) }] : []),
    ...(filtros.responsavel
      ? [{ texto: filtros.responsavel === "sem" ? "sem responsável" : usuarios.find((u) => u.id === filtros.responsavel)?.name ?? "responsável", tirar: () => onFiltros({ ...filtros, responsavel: "" }) }]
      : []),
    ...(filtros.janela ? [{ texto: `janela ${filtros.janela}`, tirar: () => onFiltros({ ...filtros, janela: "" }) }] : []),
  ];
  if (!itens.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <button key={i.texto} onClick={i.tirar} className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/5 px-2.5 py-0.5 text-[11px]">
          {i.texto} <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}

// ---------- visão em lista ----------

const COLUNAS = "lg:grid-cols-[32px_minmax(160px,1.3fr)_minmax(200px,2.4fr)_110px_90px_110px_120px]";

export function ListaFichas({
  fichas,
  selecionadas,
  onAlternar,
  onAlternarTodas,
  onAbrir,
  nomeResponsavel,
  nomeCaixa,
}: {
  fichas: FichaAtivacao[];
  selecionadas: Set<string>;
  onAlternar: (id: string) => void;
  onAlternarTodas: () => void;
  onAbrir: (f: FichaAtivacao) => void;
  nomeResponsavel: (id: string | null) => string;
  nomeCaixa: ((id: string | null) => string) | null;
}) {
  const [limite, setLimite] = useState(150);
  const todas = fichas.length > 0 && fichas.every((f) => selecionadas.has(f.conversationId));
  const tituloGaveta = (f: FichaAtivacao) => GAVETAS.find((g) => g.id === gavetaDe(f))?.titulo ?? "";
  if (!fichas.length) {
    return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma conversa com esses filtros.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn("hidden items-center gap-3 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground lg:grid", COLUNAS)}>
        <input type="checkbox" checked={todas} onChange={onAlternarTodas} aria-label="Selecionar todas" />
        <span>Paciente</span>
        <span>Próximo passo</span>
        <span>Parado</span>
        <span>Valor</span>
        <span>Origem</span>
        <span>Responsável</span>
      </div>
      <label className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground lg:hidden">
        <input type="checkbox" checked={todas} onChange={onAlternarTodas} /> Selecionar todas
      </label>
      <ul className="divide-y divide-border">
        {fichas.slice(0, limite).map((f) => {
          const sel = selecionadas.has(f.conversationId);
          const valor = valorNumerico(f);
          const j = janela24h(f.ultimaEntradaEm);
          return (
            <li
              key={f.conversationId}
              className={cn(
                "grid grid-cols-[32px_1fr] items-start gap-x-3 gap-y-1 px-3 py-2.5 text-sm lg:items-center",
                COLUNAS,
                sel && "bg-primary/5",
                estaResolvida(f) && "opacity-50",
              )}
            >
              <input type="checkbox" checked={sel} onChange={() => onAlternar(f.conversationId)} aria-label={`Selecionar ${nomeDaFicha(f)}`} className="mt-1 lg:mt-0" />
              <button onClick={() => onAbrir(f)} className="min-w-0 text-left">
                <strong className="block truncate font-semibold hover:text-primary">{nomeDaFicha(f)}</strong>
                <span className="block truncate text-xs text-muted-foreground">
                  {tituloGaveta(f)}
                  {nomeCaixa ? ` · ${nomeCaixa(f.connectionId)}` : ""}
                  {f.telefone ? ` · ${maskPhone(f.telefone)}` : ""}
                </span>
              </button>
              <p className="col-start-2 min-w-0 text-xs text-foreground/85 lg:col-start-auto">
                <span className="line-clamp-2">{f.resumo?.proximo || f.resumo?.resumo || f.ultimoTexto || "(mídia)"}</span>
                {f.tags.length > 0 && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{f.tags.join(" · ")}</span>}
              </p>
              <span className="col-start-2 text-xs lg:col-start-auto">
                <b className="tabular-nums">{tempoDeEspera(f.ultimaMsgEm)}</b>
                {j.aberta && <span className="ml-1 text-[10px] text-success">janela aberta</span>}
              </span>
              <span className="col-start-2 text-xs tabular-nums lg:col-start-auto">{valor ? reaisCurto(valor) : <span className="text-muted-foreground">-</span>}</span>
              <span className="col-start-2 text-xs text-muted-foreground lg:col-start-auto">{rotuloOrigem(f.origem)}</span>
              <span className="col-start-2 truncate text-xs text-muted-foreground lg:col-start-auto">{nomeResponsavel(f.assigneeId) || "sem responsável"}</span>
            </li>
          );
        })}
      </ul>
      {fichas.length > limite && (
        <button onClick={() => setLimite((l) => l + 150)} className="w-full border-t border-border py-2 text-xs text-primary hover:bg-muted">
          Mostrar mais ({fichas.length - limite} restantes)
        </button>
      )}
    </div>
  );
}

// ---------- barra de ações em massa ----------

const BOTAO = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary disabled:opacity-40";

export function BarraEmMassa({
  selecionadas,
  totalFiltradas,
  onSelecionarFiltradas,
  onLimpar,
  onFila,
  onExportar,
  usuarios,
}: {
  selecionadas: FichaAtivacao[];
  totalFiltradas: number;
  onSelecionarFiltradas: () => void;
  onLimpar: () => void;
  onFila: () => void;
  onExportar: () => void;
  usuarios: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const acoes = useAcoesEmMassa();
  const { data: tags } = useTags();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [novaTag, setNovaTag] = useState("");
  const [prazo, setPrazo] = useState(() => hojeSP(1));
  const [textoRetorno, setTextoRetorno] = useState("");
  const [respRetorno, setRespRetorno] = useState("");
  const n = selecionadas.length;

  const rodar = async (nome: string, fn: () => Promise<unknown>, ok: string) => {
    setOcupado(nome);
    try {
      await fn();
      toast({ title: ok });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Não deu agora. Tente de novo.", variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  };
  const plural = (um: string, varios = um) => `${n} ${n === 1 ? `conversa ${um}` : `conversas ${varios}`}`;
  const icone = (nome: string, I: typeof Check) => (ocupado === nome ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <I className="h-3.5 w-3.5" />);

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card p-2 shadow-sm" role="toolbar" aria-label="Ações em massa">
      <span className="px-1 text-sm font-semibold tabular-nums">{n} selecionada{n === 1 ? "" : "s"}</span>
      {n < totalFiltradas && (
        <button onClick={onSelecionarFiltradas} className="text-xs text-primary hover:underline">Selecionar as {totalFiltradas} filtradas</button>
      )}
      <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
      <button onClick={onFila} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Mensagens com o Claude
      </button>
      <button onClick={() => void rodar("resolver", () => acoes.resolver(selecionadas, true), plural("marcada como resolvida", "marcadas como resolvidas"))} disabled={!!ocupado} className={BOTAO}>
        {icone("resolver", Check)} Resolver
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button disabled={!!ocupado} className={BOTAO}>{icone("atribuir", UserRound)} Responsável</button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[120] w-60 p-1">
          {usuarios.map((u) => (
            <button key={u.id} onClick={() => void rodar("atribuir", () => acoes.atribuir(selecionadas, u.id), plural(`com ${u.name}`))} className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted">
              {u.name}
            </button>
          ))}
          <button onClick={() => void rodar("atribuir", () => acoes.atribuir(selecionadas, null), plural("sem responsável"))} className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted">
            Tirar responsável
          </button>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button disabled={!!ocupado} className={BOTAO}>{icone("etiqueta", Tag)} Etiqueta</button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[120] max-h-80 w-72 overflow-y-auto p-2">
          {(tags ?? []).length === 0 && <p className="p-1 text-xs text-muted-foreground">Nenhuma etiqueta criada ainda.</p>}
          {(tags ?? []).map((t: { id: string; label: string }) => {
            const com = selecionadas.filter((f) => f.tags.includes(t.label)).length;
            return (
              <div key={t.id} className="flex items-center gap-1 py-0.5 text-xs">
                <span className="min-w-0 flex-1 truncate px-1">{t.label} <span className="text-[10px] text-muted-foreground">{com}/{n}</span></span>
                <button onClick={() => void rodar("etiqueta", () => acoes.etiquetar(selecionadas, t, true), `Etiqueta "${t.label}" colocada`)} className="rounded border border-border px-2 py-0.5 hover:border-primary">pôr</button>
                <button disabled={!com} onClick={() => void rodar("etiqueta", () => acoes.etiquetar(selecionadas, t, false), `Etiqueta "${t.label}" tirada`)} className="rounded border border-border px-2 py-0.5 hover:border-destructive disabled:opacity-30">tirar</button>
              </div>
            );
          })}
          <div className="mt-2 flex gap-1 border-t border-border pt-2">
            <input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="Nova etiqueta" aria-label="Nova etiqueta" className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary" />
            <button
              disabled={!novaTag.trim()}
              onClick={() => {
                const label = novaTag.trim();
                void rodar("etiqueta", async () => {
                  const t = await acoes.criarEtiqueta(label);
                  await acoes.etiquetar(selecionadas, t, true);
                  setNovaTag("");
                }, `Etiqueta "${label}" criada e colocada`);
              }}
              className="h-8 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              Criar
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button disabled={!!ocupado} className={BOTAO}>{icone("retorno", CalendarClock)} Retorno com data</button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[120] w-72 space-y-2 p-3">
          <p className="text-xs text-muted-foreground">Cria um lembrete para cada conversa. Ele aparece na Central, em Retornos, no dia marcado.</p>
          <label className="block text-xs font-medium">
            Dia
            <input type="date" value={prazo} min={hojeSP()} onChange={(e) => setPrazo(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm" />
          </label>
          <label className="block text-xs font-medium">
            O que fazer
            <input value={textoRetorno} onChange={(e) => setTextoRetorno(e.target.value)} placeholder="Retomar a conversa" className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm" />
          </label>
          <label className="block text-xs font-medium">
            Quem faz
            <select value={respRetorno} onChange={(e) => setRespRetorno(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm">
              <option value="">O responsável de cada conversa</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <button
            disabled={!prazo || !!ocupado}
            onClick={() => void rodar(
              "retorno",
              () => acoes.agendarRetorno(selecionadas, { prazo, texto: textoRetorno, responsavelId: respRetorno || null }),
              `${n} ${n === 1 ? "retorno marcado" : "retornos marcados"} para ${prazo.split("-").reverse().slice(0, 2).join("/")}`,
            )}
            className="h-9 w-full rounded-md bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            Marcar {n} {n === 1 ? "retorno" : "retornos"}
          </button>
        </PopoverContent>
      </Popover>

      <button onClick={onExportar} className={BOTAO}><Download className="h-3.5 w-3.5" /> Exportar</button>
      <button onClick={onLimpar} className="ml-auto inline-flex h-9 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" /> Limpar seleção
      </button>
    </div>
  );
}

// ---------- fila de mensagens com o Claude ----------

type Situacao = "enviada" | "pulada";

const tipoPadrao = (f: FichaAtivacao): TipoMensagem => (f.ultimaDirecao === "in" ? "negociacao" : "ativacao");

/**
 * Revisar e enviar uma a uma: o Claude escreve a mensagem de cada conversa
 * selecionada, você lê, ajusta e envia (ou pula). Nada sai sem o clique.
 */
export function FilaMensagens({
  fichas,
  oficialDe,
  onFechar,
}: {
  fichas: FichaAtivacao[];
  oficialDe: (f: FichaAtivacao) => boolean;
  onFechar: () => void;
}) {
  const { toast } = useToast();
  const enviar = useSendMessage();
  const [indice, setIndice] = useState(0);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [tipos, setTipos] = useState<Record<string, TipoMensagem>>({});
  const [gerando, setGerando] = useState<Set<string>>(new Set());
  const [erros, setErros] = useState<Record<string, string>>({});
  const [situacao, setSituacao] = useState<Record<string, Situacao>>({});
  const [extra, setExtra] = useState("");
  const [enviando, setEnviando] = useState(false);
  const pedidos = useRef(new Set<string>());
  const assina = useMemo(() => {
    try {
      return localStorage.getItem("vert-crm-assina") ?? "";
    } catch {
      return "";
    }
  }, []);

  const atual = fichas[indice] as FichaAtivacao | undefined;
  const fim = indice >= fichas.length;
  const tipoDe = (f: FichaAtivacao) => tipos[f.conversationId] ?? tipoPadrao(f);

  const gerar = async (f: FichaAtivacao, tipo = tipoDe(f)) => {
    const id = f.conversationId;
    pedidos.current.add(id);
    setGerando((s) => new Set(s).add(id));
    setErros((er) => {
      const resto = { ...er };
      delete resto[id];
      return resto;
    });
    try {
      const texto = await escreverMensagem({ conversationId: id, tipo, roteiros: lerRoteiros(), extra, assina });
      setTextos((t) => ({ ...t, [id]: texto }));
    } catch (e) {
      setErros((er) => ({ ...er, [id]: e instanceof Error ? e.message : "O Claude não respondeu agora." }));
    } finally {
      setGerando((s) => {
        const novo = new Set(s);
        novo.delete(id);
        return novo;
      });
    }
  };

  // escreve a atual e já adianta a próxima
  useEffect(() => {
    [fichas[indice], fichas[indice + 1]].forEach((f) => {
      if (f && !pedidos.current.has(f.conversationId)) void gerar(f);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, fichas]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !enviando && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar, enviando]);

  const avancar = () => setIndice((i) => i + 1);
  const marcar = (f: FichaAtivacao, s: Situacao) => setSituacao((m) => ({ ...m, [f.conversationId]: s }));

  const enviarAtual = async () => {
    if (!atual) return;
    const texto = (textos[atual.conversationId] ?? "").trim();
    if (!texto) return;
    setEnviando(true);
    try {
      await enviar(atual.conversationId, texto);
      marcar(atual, "enviada");
      avancar();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Não enviou. Tente de novo.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const enviadas = Object.values(situacao).filter((s) => s === "enviada").length;
  const puladas = Object.values(situacao).filter((s) => s === "pulada").length;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => !enviando && onFechar()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mensagens com o Claude"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold">Mensagens com o Claude</h2>
            <p className="text-xs text-muted-foreground">
              {fim ? "Fila terminada" : `${indice + 1} de ${fichas.length}`} · {enviadas} enviada{enviadas === 1 ? "" : "s"} · {puladas} pulada{puladas === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onFechar} disabled={enviando} aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </header>
        <div className="h-1 w-full bg-muted">
          <div className="h-1 bg-primary transition-all" style={{ width: `${(Math.min(indice, fichas.length) / Math.max(1, fichas.length)) * 100}%` }} />
        </div>

        {fim || !atual ? (
          <div className="space-y-3 p-6 text-center">
            <p className="text-lg font-semibold">{enviadas} {enviadas === 1 ? "mensagem enviada" : "mensagens enviadas"}</p>
            <p className="text-sm text-muted-foreground">
              {puladas ? `${puladas} ficaram para depois.` : "Nenhuma ficou para trás."} As respostas chegam em Conversas e o quadro se atualiza sozinho.
            </p>
            <button onClick={onFechar} className="h-10 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Fechar</button>
          </div>
        ) : (
          <CartaoFila
            key={atual.conversationId}
            f={atual}
            texto={textos[atual.conversationId] ?? ""}
            onTexto={(t) => setTextos((m) => ({ ...m, [atual.conversationId]: t }))}
            tipo={tipoDe(atual)}
            onTipo={(t) => {
              setTipos((m) => ({ ...m, [atual.conversationId]: t }));
              void gerar(atual, t);
            }}
            gerando={gerando.has(atual.conversationId)}
            erro={erros[atual.conversationId]}
            extra={extra}
            onExtra={setExtra}
            oficial={oficialDe(atual)}
            enviando={enviando}
            onGerar={() => void gerar(atual)}
            onPular={() => {
              marcar(atual, "pulada");
              avancar();
            }}
            onEnviar={() => void enviarAtual()}
          />
        )}
      </div>
    </div>
  );
}

function CartaoFila({
  f, texto, onTexto, tipo, onTipo, gerando, erro, extra, onExtra, oficial, enviando, onGerar, onPular, onEnviar,
}: {
  f: FichaAtivacao;
  texto: string;
  onTexto: (t: string) => void;
  tipo: TipoMensagem;
  onTipo: (t: TipoMensagem) => void;
  gerando: boolean;
  erro?: string;
  extra: string;
  onExtra: (t: string) => void;
  oficial: boolean;
  enviando: boolean;
  onGerar: () => void;
  onPular: () => void;
  onEnviar: () => void;
}) {
  const j = janela24h(f.ultimaEntradaEm);
  const bloqueada = oficial && !j.aberta;
  const digitos = (f.telefone ?? "").replace(/\D/g, "");
  const linkWhats = digitos ? `https://wa.me/${digitos.length <= 11 ? "55" : ""}${digitos}?text=${encodeURIComponent(texto)}` : null;
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block truncate text-base">{nomeDaFicha(f)}</strong>
          <span className="text-xs text-muted-foreground">
            {GAVETAS.find((g) => g.id === gavetaDe(f))?.titulo} · parado há {tempoDeEspera(f.ultimaMsgEm)}
            {diasParado(f) >= 1 && f.telefone ? ` · ${maskPhone(f.telefone)}` : ""}
          </span>
        </div>
        <span className={cn("flex-none rounded-full border px-2 py-0.5 text-[10px]", j.aberta ? "border-success/60 text-success" : "border-border text-muted-foreground")}>
          {j.aberta ? `janela aberta · ${Math.floor(j.restanteMin / 60)} h` : "janela de 24 h fechada"}
        </span>
      </div>
      {(f.resumo?.resumo || f.ultimoTexto) && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground/85">
          {f.resumo?.resumo ?? (
            <>
              <span className="text-muted-foreground">{f.ultimaDirecao === "in" ? "Paciente: " : "Clínica: "}</span>
              {f.ultimoTexto}
            </>
          )}
          {f.resumo?.proximo && <span className="mt-1 block font-medium">{f.resumo.proximo}</span>}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTipo(t.id)}
            disabled={gerando}
            aria-pressed={tipo === t.id}
            className={cn("rounded-full border px-3 py-1 text-xs", tipo === t.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        value={extra}
        onChange={(e) => onExtra(e.target.value)}
        placeholder="Instrução para toda a fila (ex.: oferecer horário na sexta)"
        aria-label="Instrução para a fila"
        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-primary"
      />
      <div className="relative">
        <textarea
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          rows={7}
          aria-label="Mensagem"
          placeholder={gerando ? "" : "Escreva ou peça para o Claude"}
          className="w-full rounded-lg border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
        {gerando && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-card/80 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Claude escrevendo…
          </span>
        )}
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {bloqueada && (
        <p className="rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive">
          Pela API oficial, fora da janela de 24 h só vale modelo aprovado pela Meta. Envie pelo seu WhatsApp ou pule esta.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={onGerar} disabled={gerando || enviando} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary disabled:opacity-40">
          <RefreshCw className="h-3.5 w-3.5" /> Escrever de novo
        </button>
        {bloqueada && linkWhats && texto.trim() && (
          <a href={linkWhats} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:border-primary">
            Abrir no WhatsApp <ArrowRight className="h-3.5 w-3.5" />
          </a>
        )}
        <button onClick={onPular} disabled={enviando} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
          <SkipForward className="h-3.5 w-3.5" /> Pular
        </button>
        <button
          onClick={onEnviar}
          disabled={!texto.trim() || gerando || enviando || bloqueada}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar e próxima
        </button>
      </div>
    </div>
  );
}
