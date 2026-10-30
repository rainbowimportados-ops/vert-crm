import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

export interface QuickReply {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  category: string | null;
  uses: number;
}

export function useQuickReplies() {
  const { organizationId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-quick-replies", organizationId],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async (): Promise<QuickReply[]> => {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("id, title, body, shortcut, category, uses")
        .eq("organization_id", organizationId)
        .order("uses", { ascending: false })
        .order("title");
      if (error) throw error;
      return (data ?? []) as QuickReply[];
    },
  });
}

export function useQuickReplyActions() {
  const { organizationId, installationId } = useCrmContext();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm-quick-replies", organizationId] });
  return {
    async save(r: Partial<QuickReply> & { title: string; body: string }) {
      const row = {
        organization_id: organizationId, installation_id: installationId,
        title: r.title.trim(), body: r.body,
        shortcut: r.shortcut?.trim().replace(/^\/*/, "/") || null,
        category: r.category?.trim() || null,
      };
      const { error } = r.id
        ? await supabase.from("quick_replies").update(row).eq("id", r.id)
        : await supabase.from("quick_replies").insert(row);
      if (error) throw error;
      invalidate();
    },
    async remove(id: string) {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw error;
      invalidate();
    },
    /** Conta o uso (silencioso — não bloqueia o envio). */
    countUse(r: QuickReply) {
      void supabase.from("quick_replies").update({ uses: (r.uses ?? 0) + 1 }).eq("id", r.id).then(() => invalidate());
    },
  };
}

/** Substitui as variáveis padrão da resposta rápida. */
export function fillQuickReply(body: string, contactName: string | null, attendantName: string | null): string {
  const first = (s: string | null) => (s ?? "").trim().split(/\s+/)[0] || "";
  return body
    .replaceAll("{nome_cliente}", first(contactName) || "tudo bem")
    .replaceAll("{nome_atendente}", first(attendantName) || "a equipe");
}
