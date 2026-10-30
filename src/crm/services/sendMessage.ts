import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "./demo";
import type { CrmMessage, MessageType } from "../sdk/types";

interface SendResult {
  ok?: boolean;
  sent?: boolean;
  queued?: boolean;
  error?: string;
  message?: string;
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function resolveType(mimeType: string): MessageType {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

/**
 * Coloca a mensagem na conversa ANTES de a chamada sair.
 *
 * Por que: o crm-send-message ja insere a linha com delivery_status "pending"
 * antes de falar com a Evolution, mas o front esperava a resposta inteira da
 * funcao (ida e volta ate o WhatsApp) para so entao mostrar algo. Aqui a bolha
 * aparece na hora; quando a linha real chega pelo Realtime, ela substitui esta.
 * Se o envio falhar, a propria linha do banco vira "failed" e a tela ja sabe
 * desenhar isso — nao precisa de estado local paralelo.
 */
function mostraJa(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  conteudo: string,
  tipo: MessageType,
) {
  const local: CrmMessage = {
    id: `local:${conversationId}:${Date.now()}`,
    conversationId,
    direction: "out",
    type: tipo,
    content: conteudo,
    mediaUrl: null,
    createdAt: new Date().toISOString(),
    deliveryStatus: "pending",
  };
  queryClient.setQueryData<CrmMessage[]>(
    ["crm-messages", conversationId],
    (atual) => [...(atual ?? []), local],
  );
  return local.id;
}

/** Marca a bolha local como falhada, para ela nao ficar eternamente no relogio. */
function marcaFalha(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  localId: string,
) {
  queryClient.setQueryData<CrmMessage[]>(
    ["crm-messages", conversationId],
    (atual) => (atual ?? []).map((m) =>
      m.id === localId ? { ...m, deliveryStatus: "failed" as const } : m),
  );
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return async function sendText(conversationId: string, content: string) {
    if (isDemoMode()) return;
    const localId = mostraJa(queryClient, conversationId, content, "text");
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-send-message",
        { body: { conversationId, content, type: "text" } },
      );
      if (error) throw error;
      const result = (data ?? {}) as SendResult;
      if (result.ok === false)
        throw new Error(
          result.error || result.message || "Não foi possível enviar a mensagem.",
        );
    } catch (erro) {
      marcaFalha(queryClient, conversationId, localId);
      throw erro;
    }
    // Só a conversa aberta é recarregada. A lista de conversas NÃO: ela busca 300
    // conversas + perfis + até 5.000 vínculos de etiqueta, e o useCrmRealtime já
    // a invalida quando a linha da mensagem chega no banco.
    await queryClient.invalidateQueries({
      queryKey: ["crm-messages", conversationId],
    });
  };
}

export function useSendMediaMessage() {
  const queryClient = useQueryClient();

  return async function sendMedia(
    conversationId: string,
    file: Blob | File,
    options?: { fileName?: string; duration?: number; caption?: string },
  ) {
    if (isDemoMode()) return;
    if (file.size > 18 * 1024 * 1024)
      throw new Error("O arquivo precisa ter no máximo 18 MB.");
    const mimeType = file.type || "application/octet-stream";
    const type = resolveType(mimeType);
    const mediaBase64 = await fileToBase64(file);
    const inferredName =
      file instanceof File
        ? file.name
        : `${type}-${Date.now()}.${type === "audio" ? "webm" : "bin"}`;
    // A bolha entra depois do upload local (o base64 já está pronto aqui) e
    // mostra a legenda ou o nome do arquivo enquanto a Evolution não confirma.
    const localId = mostraJa(
      queryClient,
      conversationId,
      options?.caption || options?.fileName || inferredName,
      type,
    );
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-send-message",
        {
          body: {
            conversationId,
            type,
            content: options?.caption ?? "",
            mediaBase64,
            mimeType,
            fileName: options?.fileName ?? inferredName,
            duration: options?.duration ?? 0,
          },
        },
      );
      if (error) throw error;
      const result = (data ?? {}) as SendResult;
      if (result.ok === false)
        throw new Error(
          result.error || result.message || "Não foi possível enviar a mídia.",
        );
    } catch (erro) {
      marcaFalha(queryClient, conversationId, localId);
      throw erro;
    }
    await queryClient.invalidateQueries({
      queryKey: ["crm-messages", conversationId],
    });
  };
}
