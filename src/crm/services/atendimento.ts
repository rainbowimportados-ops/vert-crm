import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCrmContext } from "../provider/CrmProvider";
import { isDemoMode } from "./demo";

// ---------- Usuários atribuíveis (staff da organização) ----------
export interface CrmUser { id: string; name: string }

export function useAssignableUsers() {
  const { organizationId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-users", organizationId],
    enabled: !isDemoMode() && !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CrmUser[]> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("organization_id", organizationId)
        .order("full_name");
      return (data ?? []).map((p: any) => ({ id: p.id, name: p.full_name || p.email || "Usuário" }));
    },
  });
}

// ---------- Status / atribuição da conversa ----------
export function useUpdateConversation() {
  const { organizationId } = useCrmContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId] });
  };

  return {
    async setStatus(conversationId: string, status: string) {
      const { error } = await supabase.from("conversations").update({ status }).eq("id", conversationId);
      if (error) throw error;
      invalidate();
    },
    async assign(conversationId: string, assigneeId: string | null) {
      const { error } = await supabase.from("conversations").update({ assignee_id: assigneeId }).eq("id", conversationId);
      if (error) throw error;
      await supabase.from("conversation_assignments").insert({
        organization_id: organizationId, conversation_id: conversationId,
        assignee_id: assigneeId, assigned_by: user?.id ?? null,
      });
      invalidate();
    },
    async markRead(conversationId: string) {
      await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
      invalidate();
    },
    async setAiMode(conversationId: string, mode: "default" | "on" | "off") {
      const { error } = await supabase.from("conversations").update({ ai_mode: mode }).eq("id", conversationId);
      if (error) throw error;
      invalidate();
    },
  };
}

// ---------- Notas internas ----------
export function useNotes(conversationId: string | null) {
  return useQuery({
    queryKey: ["crm-notes", conversationId],
    enabled: !isDemoMode() && !!conversationId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("internal_notes")
        .select("id, body, created_at, author_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
}

export function useAddNote() {
  const { organizationId } = useCrmContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  return async (conversationId: string, contactId: string, body: string) => {
    const { error } = await supabase.from("internal_notes").insert({
      organization_id: organizationId, conversation_id: conversationId,
      contact_id: contactId, body, author_id: user?.id ?? null,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["crm-notes", conversationId] });
  };
}

// ---------- Tags ----------
export function useTags() {
  const { organizationId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-tags", organizationId],
    enabled: !isDemoMode() && !!organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("tags").select("id, label, color").order("label");
      return data ?? [];
    },
  });
}

export function useContactTags(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-contact-tags", contactId],
    enabled: !isDemoMode() && !!contactId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data } = await supabase.from("contact_tags").select("tag_id").eq("contact_id", contactId);
      return (data ?? []).map((r: any) => r.tag_id as string);
    },
  });
}

export function useTagActions() {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  return {
    async createTag(label: string) {
      const { data, error } = await supabase.from("tags")
        .insert({ organization_id: organizationId, label }).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["crm-tags", organizationId] });
      return data.id as string;
    },
    async toggle(contactId: string, tagId: string, on: boolean) {
      if (on) {
        await supabase.from("contact_tags").insert({ organization_id: organizationId, contact_id: contactId, tag_id: tagId });
      } else {
        await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId);
      }
      qc.invalidateQueries({ queryKey: ["crm-contact-tags", contactId] });
    },
  };
}

// ---------- Follow-ups ----------
export function useFollowups(conversationId: string | null) {
  return useQuery({
    queryKey: ["crm-followups", conversationId],
    enabled: !isDemoMode() && !!conversationId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("followups")
        .select("id, due_at, note, status")
        .eq("conversation_id", conversationId)
        .order("due_at", { ascending: true });
      return data ?? [];
    },
  });
}

export function useAddFollowup() {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  return async (conversationId: string, contactId: string, dueAt: string, note: string) => {
    const { error } = await supabase.from("followups").insert({
      organization_id: organizationId, conversation_id: conversationId,
      contact_id: contactId, due_at: dueAt, note: note || null,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["crm-followups", conversationId] });
  };
}
