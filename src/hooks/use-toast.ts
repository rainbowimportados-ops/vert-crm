import type { ReactNode } from "react";
import { toast as sonner } from "sonner";

/**
 * Ponte entre a API do shadcn (`useToast()` / `toast({ title, description })`,
 * usada em 70 arquivos) e a superfície única de notificação do sistema, que é
 * o sonner — ver `src/components/ui/sonner.tsx`.
 *
 * A assinatura é a mesma de antes de propósito: nenhum dos arquivos que já
 * chamavam `toast(...)` precisou mudar. O que mudou é que agora aparece algo
 * na tela.
 */

export interface ToastOptions {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive";
  duration?: number;
  /** Aceito para compatibilidade com chamadas antigas; o sonner controla o id. */
  id?: string;
  /**
   * Botão de ação dentro do toast — "Desfazer", tipicamente.
   *
   * O sonner suporta isto nativamente; a ponte é que não repassava. Quem trouxe
   * a necessidade foi o remarcar arrastando: o erro mais provável ali é soltar
   * sem querer, e esse erro precisa de saída imediata — não de um segundo
   * arrasto de volta para o lugar de onde veio.
   */
  action?: { label: string; onClick: () => void };
}

/** O sonner aceita `ReactNode` como mensagem, mas não como descrição em todas
 *  as versões — texto puro é o caminho seguro para as duas. */
function asText(value: ReactNode): string {
  if (value === null || value === undefined || value === false) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  // Elementos React em título/descrição são raros aqui; quando aparecem, o
  // sonner os renderiza — só o fallback de string é que não os alcança.
  return "";
}

function toast(options: ToastOptions) {
  const { title, description, variant, duration, action } = options;

  // Sem título, a descrição vira a mensagem: um toast só com texto secundário
  // e o corpo vazio é o tipo de detalhe que faz a interface parecer quebrada.
  const message = asText(title) || asText(description) || "";
  const body = asText(title) ? asText(description) : "";

  const config = {
    description: body || undefined,
    duration,
    action,
  };

  // `destructive` é a única variante que o projeto usa (330 chamadas) e ela
  // sempre significa erro.
  const id = variant === "destructive" ? sonner.error(message, config) : sonner(message, config);

  return {
    id: String(id),
    dismiss: () => sonner.dismiss(id),
    update: (next: ToastOptions) =>
      sonner(asText(next.title) || asText(next.description) || "", {
        id,
        description: asText(next.title) ? asText(next.description) : undefined,
      }),
  };
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string) => sonner.dismiss(toastId),
    /** Mantido pela forma da API do shadcn. O sonner é dono da própria fila,
     *  então aqui ela é sempre vazia — nenhum consumidor do projeto lê isto. */
    toasts: [] as const,
  };
}

export { useToast, toast };
