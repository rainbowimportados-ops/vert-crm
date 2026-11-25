import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { reais, useAcoesClinica, useFichaClinica, useSistemaClinica } from "../services/clinica";

const SEIS_HORAS = 6 * 3600_000;

/**
 * Paciente e orçamentos do sistema da clínica (Santé ou outro) para um
 * contato. Busca sozinho quando a ficha não existe ou tem mais de 6 h.
 */
export function OrcamentosClinica({ contactId }: { contactId: string }) {
  const { data: sistema } = useSistemaClinica();
  const { data: ficha, isLoading } = useFichaClinica(contactId);
  const acoes = useAcoesClinica();
  const [ocupado, setOcupado] = useState<"buscar" | "vincular" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const pedido = useRef<string | null>(null);
  const nome = sistema?.nome ?? "sistema da clínica";

  const buscar = async (forcar: boolean) => {
    setOcupado("buscar");
    setErro(null);
    try {
      await acoes.buscar(contactId, forcar);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu agora.");
    } finally {
      setOcupado(null);
    }
  };

  // primeira abertura: busca sozinho se a ficha não existe ou está velha
  useEffect(() => {
    if (!sistema?.ativo || isLoading || pedido.current === contactId) return;
    const velha = !ficha || Date.now() - new Date(ficha.buscado_em).getTime() > SEIS_HORAS;
    if (velha) {
      pedido.current = contactId;
      void buscar(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sistema?.ativo, isLoading, contactId, ficha?.buscado_em]);

  if (!sistema?.ativo) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Orçamentos do sistema da clínica não aparecem aqui ainda: ligue o {sistema ? nome : "Santé ou outro sistema"} em Configurações → Sistema da clínica.
      </p>
    );
  }

  const vincular = async () => {
    if (!link.trim()) return;
    setOcupado("vincular");
    setErro(null);
    try {
      await acoes.vincular(contactId, link.trim());
      setLink("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu agora.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section aria-label={`Orçamentos no ${nome}`}>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Orçamentos no {nome}</h3>
        {ficha?.external_url && (
          <a href={ficha.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            abrir no {nome} <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <button
          onClick={() => void buscar(true)}
          disabled={ocupado !== null}
          title={`Ler de novo no ${nome}`}
          aria-label={`Atualizar do ${nome}`}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {ocupado === "buscar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {ocupado === "buscar" && !ficha && <p className="text-xs text-muted-foreground">Lendo no {nome}…</p>}

      {ficha?.status === "ok" && ficha.paciente && (
        <p className="mb-2 text-xs text-muted-foreground">
          {ficha.paciente.nome}
          {ficha.paciente.desde ? ` · paciente desde ${ficha.paciente.desde}` : ""}
          {ficha.paciente.confere === false ? " · confira se é o mesmo paciente" : ""}
          {ficha.paciente.observacao ? ` · ${ficha.paciente.observacao}` : ""}
        </p>
      )}

      {ficha?.status === "ok" && (
        ficha.orcamentos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem orçamentos registrados.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {ficha.orcamentos.map((o, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-2 align-top">
                    {o.titulo}
                    {o.data && <small className="block text-muted-foreground">{o.data}</small>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right align-top tabular-nums">
                    {Number(o.aguardando) > 0 && (
                      <span className="block font-semibold text-destructive">{reais(o.aguardando)} <small className="font-normal text-muted-foreground">aguardando</small></span>
                    )}
                    {Number(o.aprovado) > 0 && (
                      <span className="block text-success">{reais(o.aprovado)} <small className="text-muted-foreground">aprovado</small></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {(ficha?.status === "nao_encontrado" || (ficha?.status === "erro" && !ficha.external_id)) && (
        <div className="space-y-2">
          <p className={cn("text-xs", ficha.status === "erro" ? "text-destructive" : "text-muted-foreground")}>
            {ficha.status === "erro" ? ficha.erro : `Não achei este telefone no ${nome}: pode ser lead novo.`}
          </p>
          <div className="flex gap-1.5">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={`Cole o link do paciente no ${nome}`}
              aria-label={`Link do paciente no ${nome}`}
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
            />
            <button
              onClick={() => void vincular()}
              disabled={!link.trim() || ocupado !== null}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:border-primary disabled:opacity-50"
            >
              {ocupado === "vincular" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Vincular
            </button>
          </div>
        </div>
      )}
      {ficha?.status === "erro" && ficha.external_id && <p className="mt-1 text-[11px] text-destructive">Última leitura falhou: {ficha.erro}</p>}
      {erro && <p className="mt-1 text-[11px] text-destructive">{erro}</p>}
      {ficha && <p className="mt-1 text-[10px] text-muted-foreground">Lido em {new Date(ficha.buscado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>}
    </section>
  );
}
