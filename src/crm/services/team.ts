import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  connectionIds: string[];
  active: boolean;
}

async function invokeTeam(body: any) {
  const { data, error } = await supabase.functions.invoke("crm-team", { body });
  if (error) {
    let msg = error.message;
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export function useTeam() {
  const { organizationId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-team", organizationId],
    enabled: !!organizationId,
    staleTime: 15_000,
    queryFn: async (): Promise<TeamMember[]> => {
      const d = await invokeTeam({ action: "list" });
      return (d?.members ?? []) as TeamMember[];
    },
  });
}

export function useTeamActions() {
  const { organizationId } = useCrmContext();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm-team", organizationId] });
  return {
    async create(p: { fullName: string; email: string; password: string; permissions: string[]; connectionIds: string[] }) {
      await invokeTeam({ action: "create", ...p });
      invalidate();
    },
    async update(userId: string, patch: { permissions?: string[]; connectionIds?: string[]; active?: boolean }) {
      await invokeTeam({ action: "update", userId, ...patch });
      invalidate();
    },
  };
}
