import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Send,
  Smile,
  Sparkles,
  Square,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useCrmContext } from "../provider/CrmProvider";
import {
  useQuickReplies,
  useQuickReplyActions,
  fillQuickReply,
  type QuickReply,
} from "../services/quickReplies";

interface Props {
  onSend: (text: string) => Promise<void> | void;
  onSendAudio?: (audio: Blob, durationSeconds: number) => Promise<void> | void;
  onAttach?: (file: File) => Promise<void> | void;
  onAiAssist?: () => Promise<void> | void;
  aiBusy?: boolean;
  disabled?: boolean;
  insert?: { text: string; nonce: number } | null;
  contactName?: string | null;
}

const EMOJIS = [
  "😀", "😃", "😄", "😁", "😊", "😍", "🥰", "😘",
  "😉", "😅", "😂", "🥹", "😎", "🤩", "🤔", "😢",
  "🙏", "👍", "👎", "👏", "🙌", "🤝", "💪", "❤️",
  "🧡", "💛", "💚", "💙", "💜", "✨", "🎉", "🎁",
  "✅", "❌", "⚠️", "📅", "📍", "📎", "💬", "💰",
];

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MessageComposer({
  onSend,
  onSendAudio,
  onAttach,
  onAiAssist,
  aiBusy,
  disabled,
  insert,
  contactName,
}: Props) {
  const { manifest } = useCrmContext();
  const { fullName } = useAuth();
  const [text, setText] = useState("");
  const [showQuick, setShowQuick] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingSecondsRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cancelRecordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { data: quickReplies } = useQuickReplies();
  const { countUse } = useQuickReplyActions();

  useEffect(() => {
    if (insert?.text)
      setText((current) => (current ? `${current}\n` : "") + insert.text);
  }, [insert?.nonce, insert?.text]);

  // A caixa cresce junto com o texto: zera a altura para medir o conteudo real
  // e reaplica. Sem isso o textarea fica preso em uma linha e o que foi digitado
  // rola por dentro, escondendo o comeco da mensagem.
  //
  // scrollHeight nao inclui a borda, mas o box-sizing:border-box do Tailwind
  // conta a borda dentro de height — somar as duas evita uma barra de rolagem
  // de 2px aparecer sempre. O teto continua vindo do max-h-32 do CSS: passando
  // dele, a altura para de crescer e o overflow-y assume.
  useLayoutEffect(() => {
    const campo = textareaRef.current;
    if (!campo) return;
    const estilo = window.getComputedStyle(campo);
    const borda =
      parseFloat(estilo.borderTopWidth || "0") +
      parseFloat(estilo.borderBottomWidth || "0");
    campo.style.height = "auto";
    campo.style.height = `${campo.scrollHeight + borda}px`;
  }, [text]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const slashFilter =
    text.startsWith("/") && !text.includes("\n")
      ? text.slice(1).toLowerCase()
      : null;
  const pickerOpen = showQuick || slashFilter !== null;

  const options = useMemo(() => {
    const all = quickReplies ?? [];
    if (slashFilter === null || slashFilter === "") return all.slice(0, 8);
    return all
      .filter(
        (reply) =>
          (reply.shortcut ?? "").toLowerCase().includes(slashFilter) ||
          reply.title.toLowerCase().includes(slashFilter) ||
          (reply.category ?? "").toLowerCase().includes(slashFilter),
      )
      .slice(0, 8);
  }, [quickReplies, slashFilter]);

  const pick = (reply: QuickReply) => {
    setText(fillQuickReply(reply.body, contactName ?? null, fullName));
    setShowQuick(false);
    countUse(reply);
  };

  // A caixa esvazia na hora e a bolha aparece na conversa antes de a chamada
  // sair (ver mostraJa em services/sendMessage.ts). Nada de spinner: quem
  // digita nao precisa esperar a ida e volta ate o WhatsApp para escrever a
  // proxima. Se falhar, a propria mensagem fica marcada na conversa.
  const send = () => {
    const message = text.trim();
    if (!message) return;
    setMediaError(null);
    setText("");
    void Promise.resolve(onSend(message)).catch((error: unknown) => {
      setMediaError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a mensagem.",
      );
    });
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startRecording = async () => {
    setMediaError(null);
    if (!onSendAudio) {
      setMediaError(
        "O envio de áudio ainda não está disponível nesta conexão.",
      );
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setMediaError("Este navegador não permite gravar áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        supportedType ? { mimeType: supportedType } : undefined,
      );
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelRecordingRef.current = false;
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
      setRecording(true);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const duration = Math.max(recordingSecondsRef.current, 1);
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stopTracks();
        setRecording(false);
        if (cancelRecordingRef.current || !audio.size) return;
        setSending(true);
        try {
          await onSendAudio(audio, duration);
        } catch (error: unknown) {
          setMediaError(
            error instanceof Error
              ? error.message
              : "Não foi possível enviar o áudio.",
          );
        } finally {
          setSending(false);
        }
      };
      recorder.start(250);
      timerRef.current = setInterval(
        () =>
          setRecordingSeconds((seconds) => {
            const next = seconds + 1;
            recordingSecondsRef.current = next;
            return next;
          }),
        1000,
      );
    } catch (error: unknown) {
      stopTracks();
      setRecording(false);
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError");
      setMediaError(
        denied
          ? "Permita o acesso ao microfone para gravar o áudio."
          : "Não foi possível iniciar a gravação.",
      );
    }
  };

  const finishRecording = (cancel = false) => {
    cancelRecordingRef.current = cancel;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const chooseFile = async (file?: File) => {
    if (!file || !onAttach) return;
    setMediaError(null);
    setSending(true);
    try {
      await onAttach(file);
    } catch (error: unknown) {
      setMediaError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o anexo.",
      );
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="border-t border-border bg-muted/40">
      {pickerOpen && (
        <div className="max-h-56 overflow-y-auto border-b border-border px-2 py-1.5">
          {options.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              Nenhuma resposta rápida
              {slashFilter ? ` para “${slashFilter}”` : ""}. Cadastre em
              Configurações → Respostas rápidas.
            </p>
          ) : (
            options.map((reply) => (
              <button
                key={reply.id}
                onClick={() => pick(reply)}
                className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-muted"
              >
                {reply.shortcut ? (
                  <code className="mt-0.5 flex-shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                    {reply.shortcut}
                  </code>
                ) : (
                  <Zap className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">
                    {reply.title}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {reply.body.split("\n")[0]}
                  </span>
                </span>
              </button>
            ))
          )}
          {(quickReplies ?? []).length === 0 &&
            manifest.quickActions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-2 pb-1.5 pt-1">
                {manifest.quickActions.map((action) => (
                  <button
                    key={action}
                    onClick={() => {
                      setText(
                        (current) => (current ? `${current} ` : "") + action,
                      );
                      setShowQuick(false);
                    }}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
        </div>
      )}

      {showEmoji && (
        <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto border-b border-border px-3 py-2 sm:grid-cols-10">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setText((current) => current + emoji);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-3 border-b border-destructive/20 bg-background px-3 py-2 text-sm text-destructive">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
          <strong className="font-medium">
            Gravando {formatDuration(recordingSeconds)}
          </strong>
          <span className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={() => finishRecording(true)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs hover:bg-white"
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => finishRecording(false)}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs text-white"
            >
              <Square className="h-3 w-3 fill-current" />
              Enviar
            </button>
          </span>
        </div>
      )}

      {mediaError && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {mediaError}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        onChange={(event) => void chooseFile(event.target.files?.[0])}
      />
      <div className="flex items-end gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
        {/* + : respostas rápidas, IA e anexo */}
        <Popover open={plusOpen} onOpenChange={setPlusOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Mais"
              aria-label="Mais opções de mensagem"
              className={cn(
                "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-foreground/80 shadow-elevation-sm transition hover:border-primary/40 hover:text-foreground sm:h-12 sm:w-12",
                (plusOpen || showQuick) && "border-primary/40 text-primary",
              )}
            >
              <Plus className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-60 p-1">
            <button
              type="button"
              onClick={() => {
                setShowQuick((open) => !open);
                setShowEmoji(false);
                setPlusOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
            >
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">Respostas rápidas</span>
              <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">/</kbd>
            </button>
            {manifest.modules.aiAssistant && (
              <button
                type="button"
                onClick={() => {
                  setPlusOpen(false);
                  void onAiAssist?.();
                }}
                disabled={!onAiAssist || aiBusy}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-40"
              >
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Sparkles className="h-4 w-4 text-primary" />}
                Gerar resposta com IA
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPlusOpen(false);
                fileInputRef.current?.click();
              }}
              disabled={!onAttach || sending}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-40"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              Anexar arquivo
            </button>
          </PopoverContent>
        </Popover>

        <div className="flex min-w-0 flex-1 items-end gap-0.5 rounded-[24px] border border-border bg-card py-1 pl-3.5 pr-1.5 shadow-elevation-sm focus-within:border-primary/60 sm:gap-1 sm:py-1.5 sm:pl-4 sm:pr-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (slashFilter !== null && options.length > 0) {
                  pick(options[0]);
                  return;
                }
                void send();
              }
              if (event.key === "Escape") {
                setShowQuick(false);
                setShowEmoji(false);
              }
            }}
            rows={1}
            placeholder="Digite uma mensagem…"
            title="Digite / para abrir as respostas rápidas"
            disabled={disabled || recording}
            className="max-h-32 min-h-[36px] w-0 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
          />
          <button
            onClick={() => {
              setShowEmoji((open) => !open);
              setShowQuick(false);
            }}
            className={cn("hidden flex-shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:block", showEmoji && "bg-muted text-foreground")}
            title="Emoji"
            type="button"
          >
            <Smile className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!onAttach || sending}
            className="hidden flex-shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 sm:block"
            title="Anexar arquivo"
            type="button"
          >
            <Paperclip className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <button
            onClick={() =>
              recording ? finishRecording(false) : void startRecording()
            }
            disabled={disabled || sending}
            aria-pressed={recording}
            className={cn(
              "flex-shrink-0 rounded-full p-2 hover:bg-muted disabled:opacity-40",
              recording ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground",
            )}
            title={recording ? "Parar e enviar áudio" : "Gravar áudio"}
            type="button"
          >
            <Mic className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <button
          onClick={() => void send()}
          disabled={disabled || recording || !text.trim()}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevation-md transition hover:brightness-95 disabled:opacity-50 sm:h-14 sm:w-14"
          title="Enviar"
          type="button"
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  );
}
