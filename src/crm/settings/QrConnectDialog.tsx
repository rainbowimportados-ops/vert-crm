import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { X, Loader2, RefreshCw, CheckCircle2, AlertCircle, Smartphone, QrCode } from "lucide-react";
import { useCrmContext } from "../provider/CrmProvider";

/** Passos de pareamento — espelham a tela oficial do WhatsApp. */
const STEPS = [
  "Abra o WhatsApp no seu celular.",
  "Toque em Mais opções (⋮) no Android, ou em Configurações no iPhone.",
  "Toque em Dispositivos conectados e depois em Conectar dispositivo.",
  "Aponte a câmera do celular para este QR code.",
  "Mantenha esta tela aberta até a conexão ser concluída.",
];

/**
 * Tela guiada de conexão do WhatsApp (QR + passo a passo), no estilo do app oficial.
 * Gera o QR pela Evolution (via crm-evolution) e faz polling de status até conectar.
 */
/** Telefone do WhatsApp em formato de leitura: 5516988094942 → (16) 98809-4942 */
function formatarTelefone(valor: string | null) {
  const d = String(valor || "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor || "";
}

export function QrConnectDialog({ open, connectionId, connectionName, aguardaNome = false, onClose }: {
  open: boolean;
  connectionId: string | null;
  connectionName: string;
  /**
   * Conexão criada pelo botão "Conectar outro WhatsApp": nasce sem nome, e o
   * nome é pedido DEPOIS do pareamento, já com o número identificado na tela.
   * Perguntar antes obrigaria a pessoa a preencher formulário sem saber ainda
   * qual número ela vai parear.
   */
  aguardaNome?: boolean;
  onClose: () => void;
}) {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [ttl, setTtl] = useState(30); // segundos até renovar o QR sozinho
  const [telefone, setTelefone] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const pollRef = useRef<number | null>(null);

  const invalidateStatus = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["crm-connection", organizationId] });
    qc.invalidateQueries({ queryKey: ["crm-connection-full", organizationId] });
  }, [qc, organizationId]);

  const genQr = useCallback(async () => {
    setLoading(true); setError(null); setQr(null);
    try {
      if (!connectionId) throw new Error("Selecione uma conexão.");
      const { data, error } = await supabase.functions.invoke("crm-evolution", {
        body: { action: "connect", connectionId },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.configured === false) {
        setError("A conexão ainda não está configurada no servidor. Verifique a instância e a chave em Configurações.");
        return;
      }
      if (d?.error) { setError(String(d.error)); return; }
      if (d?.status === "connected" || d?.state === "open") { setConnected(true); invalidateStatus(); return; }
      const q = d?.qr;
      if (q) { setQr(q.startsWith("data:") ? q : `data:image/png;base64,${q}`); setTtl(30); }
      else setError("O servidor não retornou o QR code. Tente gerar novamente.");
    } catch (e: any) {
      setError(e?.message || "Não foi possível gerar o QR code.");
    } finally {
      setLoading(false);
    }
  }, [connectionId, invalidateStatus]);

  // Ao abrir: gera o QR e zera o estado
  useEffect(() => {
    if (!open) return;
    setConnected(false); setQr(null); setError(null);
    genQr();
  }, [open, genQr]);

  // O QR expira rápido — renova sozinho a cada 30s enquanto ninguém escaneia.
  useEffect(() => {
    if (!open || connected || loading || error || !qr) return;
    const t = window.setInterval(() => {
      setTtl((v) => {
        if (v <= 1) { void genQr(); return 30; }
        return v - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [open, connected, loading, error, qr, genQr]);

  // Polling de status enquanto aberto e não conectado
  useEffect(() => {
    if (!open || connected) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("crm-evolution", {
          body: { action: "status", connectionId },
        });
        const st = (data as any)?.status;
        if (st === "connected") { setConnected(true); invalidateStatus(); }
      } catch { /* silencioso — tenta de novo no próximo ciclo */ }
    }, 4000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [open, connected, connectionId, invalidateStatus]);

  // Assim que conecta, diz à Evolution para onde mandar os eventos.
  //
  // Sem isto o pareamento termina "com sucesso" e o inbox fica mudo para
  // sempre: a instância existe, aparece como conectada, e nenhuma mensagem
  // chega — porque ninguém nunca registrou o webhook. Até hoje isso só
  // funcionava quando alguém configurava à mão no painel da Evolution.
  //
  // É especialmente necessário quando duas conexões dividem o mesmo nome de
  // instância: o webhook da Evolution é um só por instância, e precisa apontar
  // para a conexão que está em uso agora, não para uma antiga.
  useEffect(() => {
    if (!connected || !connectionId) return;
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("crm-webhook-setup", {
        body: { connectionId },
      });
      if (cancelado) return;
      const r = data as any;
      // A falha não desfaz o pareamento — o WhatsApp está conectado e dá para
      // enviar. Mas quem acabou de parear precisa saber que não vai receber.
      if (error || r?.ok === false) {
        setError(
          "O WhatsApp conectou, mas não foi possível registrar o webhook: " +
            (error?.message || r?.error || "erro desconhecido") +
            ". As mensagens recebidas não vão aparecer no CRM até isso ser resolvido.",
        );
      }
    })();
    return () => { cancelado = true; };
  }, [connected, connectionId]);

  // O número só é conhecido depois do pareamento: quem grava é a crm-evolution,
  // pelo persistInstance, a partir do que a Evolution devolve.
  useEffect(() => {
    if (!connected || !connectionId) return;
    let vivo = true;
    supabase
      .from("whatsapp_connections")
      .select("phone_number")
      .eq("id", connectionId)
      .maybeSingle()
      .then(({ data }) => { if (vivo) setTelefone((data as any)?.phone_number ?? null); });
    return () => { vivo = false; };
  }, [connected, connectionId]);

  // Fecha sozinho pouco depois de conectar — exceto quando ainda falta nomear.
  useEffect(() => {
    if (!connected || aguardaNome) return;
    const t = window.setTimeout(() => onClose(), 2200);
    return () => window.clearTimeout(t);
  }, [connected, aguardaNome, onClose]);

  const salvarNome = async () => {
    const limpo = nome.trim();
    if (!limpo || !connectionId) return;
    setSalvandoNome(true);
    await supabase.from("whatsapp_connections").update({ display_name: limpo }).eq("id", connectionId);
    setSalvandoNome(false);
    invalidateStatus();
    qc.invalidateQueries({ queryKey: ["crm-connections", organizationId] });
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          title="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 border-b border-border px-6 py-4">
          <QrCode className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold text-foreground">Conectar WhatsApp</h2>
            <p className="text-xs text-muted-foreground">{connectionName}</p>
          </div>
        </div>

        {connected ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
              <CheckCircle2 className="h-9 w-9 text-success" />
            </div>
            <p className="text-lg font-semibold text-foreground">WhatsApp conectado!</p>
            {telefone && (
              <p className="text-sm font-medium tabular-nums text-foreground">{formatarTelefone(telefone)}</p>
            )}
            {aguardaNome ? (
              <div className="mt-2 w-full max-w-sm space-y-2 text-left">
                <label className="block text-xs font-semibold text-foreground" htmlFor="nome-da-conexao">
                  Como você quer chamar este número?
                </label>
                <input
                  id="nome-da-conexao"
                  autoFocus
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void salvarNome(); }}
                  placeholder="Ex.: Recepção, Comercial, Dra. Anita"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
                />
                <p className="text-[11px] text-muted-foreground">
                  É só o apelido que aparece no CRM. Dá para trocar depois.
                </p>
                <button
                  onClick={salvarNome}
                  disabled={!nome.trim() || salvandoNome}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {salvandoNome ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Concluir
                </button>
              </div>
            ) : (
              <p className="max-w-sm text-sm text-muted-foreground">
                Tudo pronto. As conversas já podem ser recebidas e respondidas pelo CRM.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-6 p-6 sm:grid-cols-[220px_1fr]">
            {/* QR */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-border bg-background p-2">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <span className="text-xs">Gerando QR…</span>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center gap-2 px-3 text-center text-destructive">
                    <AlertCircle className="h-7 w-7" />
                    <span className="text-[11px] leading-snug">{error}</span>
                  </div>
                ) : qr ? (
                  <img src={qr} alt="QR code de conexão" className="h-full w-full rounded-xl object-contain" />
                ) : (
                  <span className="px-3 text-center text-xs text-muted-foreground">QR indisponível.</span>
                )}
              </div>
              <button
                onClick={genQr}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Gerar novo QR
              </button>
              {!error && qr && !loading && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-medium text-warning">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  Aguardando leitura · renova em {ttl}s
                </span>
              )}
            </div>

            {/* Passo a passo */}
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <Smartphone className="h-4 w-4 text-primary" /> Como conectar
              </div>
              <ol className="space-y-3">
                {STEPS.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm leading-snug text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-[11px] text-muted-foreground">
                O QR renova sozinho antes de expirar — é só deixar esta tela aberta e escanear com calma.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
