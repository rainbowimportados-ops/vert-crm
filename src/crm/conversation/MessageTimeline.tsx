import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, Clock, AlertCircle, RotateCcw } from "lucide-react";
import type { CrmMessage } from "../sdk/types";
import { MediaAttachment } from "./MediaAttachment";
import { rotuloDoDia } from "../sdk/datas";

function StatusIcon({ status }: { status: CrmMessage["deliveryStatus"] }) {
  switch (status) {
    case "pending": return <Clock className="h-3 w-3 opacity-70" />;
    case "sent": return <Check className="h-3.5 w-3.5 opacity-70" />;
    case "delivered": return <CheckCheck className="h-3.5 w-3.5 opacity-70" />;
    case "read": return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
    case "failed": return <AlertCircle className="h-3 w-3 text-destructive" />;
    default: return null;
  }
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function MessageTimeline({
  messages,
  onRetry,
}: {
  messages: CrmMessage[];
  /** Reenvia uma mensagem que o WhatsApp recusou. Sem isso, o erro só é exibido. */
  onRetry?: (message: CrmMessage) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const convId = messages[0]?.conversationId ?? null;
  const lastId = messages[messages.length - 1]?.id ?? null;

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [convId]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lastId]);

  if (messages.length === 0) {
    return <div className="flex flex-1 items-center justify-center bg-muted/40 px-6 text-center text-sm text-muted-foreground">Sem mensagens nesta conversa.</div>;
  }
  return (
    <div ref={boxRef} className="crm-chat-surface flex flex-1 flex-col gap-2.5 overflow-y-auto bg-muted/40 px-4 py-5 sm:px-8">
      {messages.map((m, i) => {
        const out = m.direction === "out";
        const hasMedia = m.type !== "text";
        const dia = rotuloDoDia(m.createdAt);
        const novoDia = i === 0 || rotuloDoDia(messages[i - 1].createdAt) !== dia;
        return (
          <div key={m.id} className="flex flex-col gap-2.5">
            {novoDia && (
              <div className="my-2 flex justify-center">
                <span className="rounded-full bg-card/80 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-elevation-sm">{dia}</span>
              </div>
            )}
            <div className={cn("flex", out ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[86%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed text-foreground shadow-elevation-sm sm:max-w-[70%]",
                  out ? "crm-bubble-out rounded-br-md bg-primary/10" : "crm-bubble-in rounded-bl-md bg-card",
                )}
              >
                {hasMedia && <MediaAttachment message={m} />}
                {m.content && (!hasMedia || !["Imagem", "Vídeo", "Áudio", "Documento"].includes(m.content)) && (
                  <p className={cn("whitespace-pre-wrap break-words", hasMedia && "mt-2")}>{m.content}</p>
                )}
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                  {out && m.deliveryStatus === "failed" && onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(m)}
                      className="mr-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                      title="O WhatsApp não aceitou esta mensagem. Toque para enviar de novo."
                    >
                      <RotateCcw className="h-3 w-3" />
                      Tentar de novo
                    </button>
                  )}
                  <span>{time(m.createdAt)}</span>
                  {out && <StatusIcon status={m.deliveryStatus} />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
