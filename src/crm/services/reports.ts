import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

export interface CrmReport {
  new_leads: number; contacts_total: number; patients_linked: number;
  conversations_total: number; conversations_period: number;
  messages_in: number; messages_out: number; failed_sends: number;
  followups_pending: number; campaigns: number;
  by_status: Record<string, number>;
  avg_first_response_seconds: number;
}

export function useReport(fromIso: string, toIso: string) {
  const { organizationId, activeConnectionId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-report", organizationId, activeConnectionId, fromIso, toIso],
    enabled: !!organizationId && !!activeConnectionId,
    queryFn: async (): Promise<CrmReport | null> => {
      const { data, error } = await supabase.rpc("crm_report", { _from: fromIso, _to: toIso, _connection: activeConnectionId! } as any);
      if (error) throw error;
      return data as unknown as CrmReport;
    },
  });
}
