import { useEffect, useState } from "react";
import { Download, FileText, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { CrmMessage } from "../sdk/types";

type MediaResult = {
  url: string;
  mimeType?: string | null;
  fileName?: string | null;
};

function fallbackName(message: CrmMessage) {
  const content = message.content?.trim();
  if (content && !["Imagem", "Vídeo", "Áudio", "Documento"].includes(content)) return content;
  return message.type === "image"
    ? "imagem"
    : message.type === "video"
      ? "video"
      : message.type === "audio"
        ? "audio"
        : "documento";
}

export function MediaAttachment({ message, compact = false }: { message: CrmMessage; compact?: boolean }) {
  const [media, setMedia] = useState<MediaResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void supabase.functions
      .invoke("crm-media", { body: { messageId: message.id } })
      .then(({ data, error: invokeError }) => {
        if (!active) return;
        if (invokeError || !data?.ok || !data?.url) {
          setError(data?.error || invokeError?.message || "Arquivo indisponível.");
          return;
        }
        setMedia({ url: data.url, mimeType: data.mimeType, fileName: data.fileName });
      })
      .catch(() => active && setError("Arquivo indisponível."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [message.id, nonce]);

  const name = media?.fileName || fallbackName(message);
  if (loading) {
    return (
      <div className="flex min-h-16 items-center justify-center gap-2 rounded-xl bg-muted/50 px-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando arquivo…
      </div>
    );
  }
  if (error || !media) {
    return (
      <button
        type="button"
        onClick={() => setNonce((value) => value + 1)}
        className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs text-muted-foreground hover:bg-muted/50"
      >
        <RefreshCw className="h-4 w-4" /> {error || "Arquivo indisponível."} Tentar novamente
      </button>
    );
  }

  if (message.type === "image") {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl bg-muted/50">
        <img src={media.url} alt={name} loading="lazy" className={cn("w-full object-cover transition group-hover:opacity-90", compact ? "h-36" : "max-h-80")} />
        {compact && <span className="flex items-center gap-1.5 px-2 py-1.5 text-xs"><ImageIcon className="h-3.5 w-3.5" />{name}</span>}
      </a>
    );
  }
  if (message.type === "video") {
    return <video src={media.url} controls preload="metadata" className={cn("w-full rounded-xl bg-black", compact ? "max-h-48" : "max-h-80")} />;
  }
  if (message.type === "audio") {
    return <audio src={media.url} controls preload="metadata" className="h-10 w-full min-w-56 max-w-full" />;
  }
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      download={name}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-2 hover:bg-muted"
    >
      <FileText className="h-7 w-7 flex-shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
      <Download className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </a>
  );
}
