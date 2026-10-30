import { supabase } from "@/integrations/supabase/client";

export type AiAction = "summary" | "analyze" | "suggest";

export interface AiResult {
  ok?: boolean;
  action?: AiAction;
  summary?: string;
  reply?: string;
  intent?: string;
  procedure?: string;
  unit?: string;
  objection?: string;
  interest_level?: string;
  urgency?: string;
  error?: string;
}

/** Chama o assistente de IA do CRM (backend valida permissão e ancora nos dados da clínica). */
export function useAiAssist() {
  return async (conversationId: string, action: AiAction, draft?: string): Promise<AiResult> => {
    const { data, error } = await supabase.functions.invoke("crm-ai-assist", {
      body: { conversationId, action, draft },
    });
    if (error) {
      // Extrai a mensagem real do corpo (mesmo em respostas não-2xx)
      let msg = error.message;
      try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      return { error: msg };
    }
    return (data as AiResult) ?? {};
  };
}
