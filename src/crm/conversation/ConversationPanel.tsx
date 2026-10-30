import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  CalendarPlus,
  DollarSign,
  Sparkles,
  Tag as TagIcon,
  Loader2,
} from "lucide-react";
import { ContactHeader } from "./ContactHeader";
import { AtendimentoBar } from "./AtendimentoBar";
import { TagPopover } from "./TagPopover";
import { MessageTimeline } from "./MessageTimeline";
import { MessageComposer } from "./MessageComposer";
import { MediaAttachment } from "./MediaAttachment";
import { ScheduleDialog } from "./ScheduleDialog";
import { useMessages } from "../services/conversations";
import { useSendMediaMessage, useSendMessage } from "../services/sendMessage";
import {
  usePatient,
  usePatientAppointments,
  usePatientBudgets,
  useProcedures,
} from "../services/clinic";
import {
  useNotes,
  useAddNote,
  useFollowups,
  useAddFollowup,
  useUpdateConversation,
} from "../services/atendimento";
import { useAiAssist, type AiAction, type AiResult } from "../services/ai";
import { isDemoMode } from "../services/demo";
import { useCrmContext } from "../provider/CrmProvider";
import type { CrmConversation, CrmMessage } from "../sdk/types";

type Tab = "conversa" | "dados" | "historico" | "notas" | "arquivos";
const TABS: { key: Tab; label: string }[] = [
  { key: "conversa", label: "Conversa" },
  { key: "dados", label: "Dados" },
  { key: "historico", label: "Histórico" },
  { key: "notas", label: "Notas" },
  { key: "arquivos", label: "Arquivos" },
];

const money = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

interface Props {
  conversation: CrmConversation | null;
  onBack?: () => void;
}

export function ConversationPanel({ conversation, onBack }: Props) {
  const { manifest } = useCrmContext();
  const sendText = useSendMessage();
  const sendMedia = useSendMediaMessage();
  const integ = manifest.integrations ?? {};
  const [tab, setTab] = useState<Tab>("conversa");
  const base = useMessages(conversation?.id ?? null);
  const [extra, setExtra] = useState<CrmMessage[]>([]);
  const [note, setNote] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [valuesOpen, setValuesOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [insert, setInsert] = useState<{ text: string; nonce: number } | null>(
    null,
  );
  const [fuDate, setFuDate] = useState("");
  const [fuNote, setFuNote] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState<AiAction | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const aiAssist = useAiAssist();

  const patientId = conversation?.contact.patientId ?? null;
  const { data: patient } = usePatient(patientId);
  const { data: appts } = usePatientAppointments(
    tab === "historico" ? patientId : null,
  );
  const { data: budgets } = usePatientBudgets(
    tab === "historico" ? patientId : null,
  );
  const { data: procedures } = useProcedures();
  const { data: notes } = useNotes(
    tab === "notas" ? (conversation?.id ?? null) : null,
  );
  const { data: followups } = useFollowups(
    tab === "notas" ? (conversation?.id ?? null) : null,
  );
  const addNote = useAddNote();
  const addFollowup = useAddFollowup();
  const { markRead } = useUpdateConversation();

  useEffect(() => {
    setExtra([]);
    setTab("conversa");
    setValuesOpen(false);
    setTagOpen(false);
    setAiOpen(false);
    setAiResult(null);
  }, [conversation?.id]);
  useEffect(() => {
    if (conversation && !isDemoMode() && conversation.unread > 0) {
      void markRead(conversation.id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);
  const messages = useMemo(() => [...base, ...extra], [base, extra]);
  const mediaMessages = useMemo(
    () => messages.filter((message) => message.type !== "text"),
    [messages],
  );

  if (!conversation) {
    return (
      <div className="hidden flex-1 flex-col items-center justify-center bg-background text-center md:flex">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <MessageCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          Selecione uma conversa
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Escolha um atendimento na fila para ver e responder as mensagens aqui.
        </p>
      </div>
    );
  }

  const handleSend = async (text: string) => {
    if (isDemoMode()) {
      setExtra((prev) => [
        ...prev,
        {
          id: `local-${prev.length}-${text.length}`,
          conversationId: conversation.id,
          direction: "out",
          type: "text",
          content: text,
          createdAt: new Date().toISOString(),
          deliveryStatus: "pending",
        },
      ]);
      return;
    }
    await sendText(conversation.id, text);
  };

  const runAi = async (action: AiAction): Promise<AiResult | null> => {
    if (!conversation || isDemoMode()) return null;
    setAiOpen(true);
    setAiBusy(action);
    setAiResult(null);
    try {
      const result = await aiAssist(conversation.id, action);
      setAiResult(result);
      return result;
    } catch (error: unknown) {
      const result: AiResult = {
        error: error instanceof Error ? error.message : "Falha na IA",
      };
      setAiResult(result);
      return result;
    } finally {
      setAiBusy(null);
    }
  };

  const generateComposerReply = async () => {
    const result = await runAi("suggest");
    if (result?.reply) setInsert({ text: result.reply, nonce: Date.now() });
  };

  const handleSendAudio = async (audio: Blob, duration: number) => {
    if (isDemoMode()) {
      setExtra((current) => [
        ...current,
        {
          id: `local-audio-${Date.now()}`,
          conversationId: conversation.id,
          direction: "out",
          type: "audio",
          content: `Áudio · ${duration}s`,
          createdAt: new Date().toISOString(),
          deliveryStatus: "pending",
        },
      ]);
      return;
    }
    await sendMedia(conversation.id, audio, {
      duration,
      fileName: `audio-${Date.now()}.webm`,
    });
  };

  const handleAttach = async (file: File) => {
    if (isDemoMode()) {
      const type = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "audio"
            : "document";
      setExtra((current) => [
        ...current,
        {
          id: `local-file-${Date.now()}`,
          conversationId: conversation.id,
          direction: "out",
          type,
          content: file.name,
          createdAt: new Date().toISOString(),
          deliveryStatus: "pending",
        },
      ]);
      return;
    }
    await sendMedia(conversation.id, file, { fileName: file.name });
  };

  const insertProcedureValue = (name: string, price: number | null) => {
    const line =
      price == null
        ? `Sobre ${name}: me confirma que já te passo o valor. 😊`
        : `O valor de ${name} é ${money(price)}.`;
    setInsert({ text: line, nonce: Date.now() });
    setValuesOpen(false);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <ContactHeader conversation={conversation} onBack={onBack} />
      {!isDemoMode() && <AtendimentoBar conversation={conversation} />}

      <div className="flex gap-1 border-b border-border bg-card px-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative px-3 py-2.5 text-sm transition-colors",
              tab === t.key
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {tab === "conversa" && (
        <>
          <div className="relative flex flex-wrap gap-1.5 border-b border-border bg-muted/30 px-4 py-2">
            {integ.agenda && (
              <QuickAction
                icon={CalendarPlus}
                label="Agendar"
                onClick={() => setScheduleOpen(true)}
              />
            )}
            {integ.procedures && (
              <QuickAction
                icon={DollarSign}
                label="Valores"
                onClick={() => setValuesOpen((v) => !v)}
              />
            )}
            <QuickAction
              icon={TagIcon}
              label="Etiqueta"
              onClick={() => setTagOpen((v) => !v)}
            />
            {manifest.modules.aiAssistant && !isDemoMode() && (
              <QuickAction
                icon={Sparkles}
                label="IA"
                primary
                onClick={() => setAiOpen((v) => !v)}
              />
            )}

            {tagOpen && !isDemoMode() && (
              <TagPopover
                contactId={conversation.contact.id}
                onClose={() => setTagOpen(false)}
              />
            )}

            {valuesOpen && (
              <div className="absolute left-4 top-12 z-20 max-h-72 w-72 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-elevation-lg">
                {(procedures ?? []).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Nenhum procedimento cadastrado.
                  </div>
                ) : (
                  (procedures ?? []).map((p) => (
                    <button
                      key={p.id}
                      onClick={() =>
                        insertProcedureValue(p.name, p.default_price)
                      }
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="flex-shrink-0 text-xs text-muted-foreground">
                        {money(p.default_price)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {aiOpen && !isDemoMode() && (
            <div className="border-b border-border bg-primary/5 px-4 py-3">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> Assistente IA
                </span>
                <button
                  onClick={() => void runAi("summary")}
                  disabled={!!aiBusy}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  Resumir
                </button>
                <button
                  onClick={() => void runAi("analyze")}
                  disabled={!!aiBusy}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  Analisar
                </button>
                <button
                  onClick={() => void runAi("suggest")}
                  disabled={!!aiBusy}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  Sugerir resposta
                </button>
                {aiBusy && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
              </div>
              {aiResult?.error && (
                <p className="text-xs text-destructive">{aiResult.error}</p>
              )}
              {aiResult?.summary && (
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {aiResult.summary}
                </p>
              )}
              {aiResult?.action === "analyze" && !aiResult.error && (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {aiResult.intent && (
                    <span className="rounded-full border border-border bg-card px-2 py-0.5">
                      Intenção: {aiResult.intent}
                    </span>
                  )}
                  {aiResult.procedure && (
                    <span className="rounded-full border border-border bg-card px-2 py-0.5">
                      Procedimento: {aiResult.procedure}
                    </span>
                  )}
                  {aiResult.unit && (
                    <span className="rounded-full border border-border bg-card px-2 py-0.5">
                      Unidade: {aiResult.unit}
                    </span>
                  )}
                  {aiResult.interest_level && (
                    <span className="rounded-full border border-border bg-card px-2 py-0.5">
                      Interesse: {aiResult.interest_level}
                    </span>
                  )}
                  {aiResult.urgency && (
                    <span className="rounded-full border border-border bg-card px-2 py-0.5">
                      Urgência: {aiResult.urgency}
                    </span>
                  )}
                  {aiResult.objection && (
                    <span className="rounded-full border border-border bg-card px-2 py-0.5">
                      Objeção: {aiResult.objection}
                    </span>
                  )}
                </div>
              )}
              {aiResult?.reply && (
                <div className="rounded-xl border border-border bg-card p-2.5">
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {aiResult.reply}
                  </p>
                  <div className="mt-1.5 flex justify-end">
                    <button
                      onClick={() =>
                        setInsert({ text: aiResult.reply!, nonce: Date.now() })
                      }
                      className="rounded-xl bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                    >
                      Usar no campo
                    </button>
                  </div>
                </div>
              )}
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Sugestões da IA — revise antes de enviar. A IA nunca envia
                sozinha.
              </p>
            </div>
          )}

          <MessageTimeline
            messages={messages}
            onRetry={(m) => {
              // Reenvia o mesmo texto. A linha antiga (failed) fica no histórico
              // como registro da tentativa; a nova entra como pendente.
              if (m.type === "text" && m.content) void handleSend(m.content);
            }}
          />
          <MessageComposer
            onSend={handleSend}
            onSendAudio={handleSendAudio}
            onAttach={handleAttach}
            onAiAssist={generateComposerReply}
            aiBusy={aiBusy === "suggest"}
            insert={insert}
            contactName={conversation.contact.name}
          />
        </>
      )}

      {tab === "dados" && (
        <div className="flex-1 overflow-y-auto p-4">
          {patient ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Paciente cadastrado
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {patient.name}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>CPF: {patient.cpf || "—"}</span>
                  <span>Cidade: {patient.city || "—"}</span>
                  <span>Tel: {patient.phone || patient.whatsapp || "—"}</span>
                  <span>E-mail: {patient.email || "—"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {manifest.leadFields.map((f) => (
                <div
                  key={f}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {fieldLabel(f)}
                  </div>
                  <div className="mt-1 text-sm text-foreground">
                    {f === "city"
                      ? (conversation.contact.city ?? "—")
                      : f === "interest"
                        ? (conversation.interest ?? "—")
                        : "—"}
                  </div>
                </div>
              ))}
              {integ.agenda && (
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  Contato ainda não é paciente. Use “Agendar” para converter em
                  paciente.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "historico" && (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!patientId ? (
            <p className="text-center text-sm text-muted-foreground">
              Sem histórico — contato ainda não vinculado a um paciente.
            </p>
          ) : (
            <>
              {integ.agenda && (
                <section>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Agendamentos
                  </h4>
                  {(appts ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum agendamento.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {(appts ?? []).map((a: any) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span>
                            {a.procedure?.name ||
                              a.procedure_text ||
                              "Consulta"}
                            {a.doctor?.name ? ` · ${a.doctor.name}` : ""}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {dt(a.scheduled_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {integ.budgets && (
                <section>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Orçamentos
                  </h4>
                  {(budgets ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum orçamento.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {(budgets ?? []).map((b: any) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span>
                            {b.procedimento || "Orçamento"} ·{" "}
                            <span className="text-muted-foreground">
                              {b.status}
                            </span>
                          </span>
                          <span className="text-xs font-medium">
                            {money(Number(b.total_value))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {tab === "notas" && (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* Nota interna */}
          <div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anotação interna (não enviada ao cliente)…"
              className="min-h-20 w-full resize-none rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
            />
            <div className="mt-1.5 flex justify-end">
              <button
                onClick={async () => {
                  const b = note.trim();
                  if (!b) return;
                  await addNote(
                    conversation.id,
                    conversation.contact.id,
                    b,
                  ).catch(() => {});
                  setNote("");
                }}
                disabled={!note.trim()}
                className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                Salvar nota
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {(notes ?? []).map((n: any) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-border bg-card p-2.5 text-sm"
                >
                  <p className="whitespace-pre-wrap text-foreground">
                    {n.body}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {dt(n.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Follow-up */}
          <div className="border-t border-border pt-3">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Próximo follow-up
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={fuDate}
                onChange={(e) => setFuDate(e.target.value)}
                className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              />
              <input
                value={fuNote}
                onChange={(e) => setFuNote(e.target.value)}
                placeholder="Observação (opcional)"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={async () => {
                  if (!fuDate) return;
                  await addFollowup(
                    conversation.id,
                    conversation.contact.id,
                    new Date(fuDate).toISOString(),
                    fuNote,
                  ).catch(() => {});
                  setFuDate("");
                  setFuNote("");
                }}
                disabled={!fuDate}
                className="rounded-xl border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              >
                Agendar follow-up
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {(followups ?? []).map((f: any) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <span>{f.note || "Follow-up"}</span>
                  <span className="text-xs text-muted-foreground">
                    {dt(f.due_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "arquivos" && (
        <div className="flex-1 overflow-y-auto p-4">
          {mediaMessages.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Nenhum arquivo nesta conversa.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {mediaMessages.map((message) => (
                <div key={message.id} className="rounded-2xl border border-border bg-card p-2 shadow-sm">
                  <MediaAttachment message={message} compact />
                  <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">{dt(message.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {scheduleOpen && (
        <ScheduleDialog
          conversation={conversation}
          onClose={() => setScheduleOpen(false)}
          onScheduled={() => setTab("historico")}
        />
      )}
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  primary,
  onClick,
}: {
  icon: typeof CalendarPlus;
  label: string;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        primary
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function fieldLabel(key: string): string {
  const map: Record<string, string> = {
    interest: "Interesse",
    city: "Cidade",
    unit: "Unidade",
    interestLevel: "Nível de interesse",
    mainObjection: "Objeção principal",
    procedure: "Procedimento",
  };
  return map[key] ?? key;
}
