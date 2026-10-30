import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

export interface Campaign {
  id: string; name: string; message_template: string; status: string;
  filters: any; created_at: string;
  recipients?: number;
}

export function useCampaigns() {
  const { organizationId, activeConnectionId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-campaigns", organizationId, activeConnectionId],
    enabled: !!organizationId && !!activeConnectionId,
    queryFn: async (): Promise<Campaign[]> => {
      const { data } = await supabase
        .from("campaigns")
.select("id, name, message_template, status, filters, created_at, campaign_recipients(count)")
        .eq("connection_id", activeConnectionId!)
        .order("created_at", { ascending: false });
      return (data ?? []).map((c: any) => ({ ...c, recipients: c.campaign_recipients?.[0]?.count ?? 0 }));
    },
  });
}

export function useCampaignActions() {
  const { organizationId, installationId, activeConnectionId } = useCrmContext();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm-campaigns", organizationId, activeConnectionId] });
  return {
    async create(name: string, template: string, tagId?: string) {
      if (!activeConnectionId) throw new Error("Nenhum painel de WhatsApp liberado.");
      const { error } = await supabase.from("campaigns").insert({
        organization_id: organizationId, installation_id: installationId, connection_id: activeConnectionId,
        name, message_template: template, filters: { ...(tagId ? { tagId } : {}), connectionId: activeConnectionId },
      });
      if (error) throw error;
      invalidate();
    },
    async dispatch(campaignId: string) {
      const { data, error } = await supabase.functions.invoke("crm-campaign-dispatch", { body: { campaignId } });
      if (error) throw error;
      invalidate();
      qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId] });
      return data as { queued?: number; skipped?: number; reason?: string };
    },
  };
}
