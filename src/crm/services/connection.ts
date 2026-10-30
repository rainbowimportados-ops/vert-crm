import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import { isDemoMode } from "./demo";

export interface WhatsappConnection {
  id: string;
  displayName: string;
  instanceName: string | null;
  phoneNumber: string | null;
  status: string;
  isDefault: boolean;
  isActive: boolean;
  sector: string | null;
  defaultAssigneeId: string | null;
  baseUrl?: string | null;
  webhookSecret?: string | null;
  lastStatusAt?: string | null;
}

function mapConnection(row: any): WhatsappConnection {
  return {
    id: row.id,
    displayName: row.display_name || row.phone_number || row.instance_name || "WhatsApp",
    instanceName: row.instance_name ?? null,
    phoneNumber: row.phone_number ?? null,
    status: row.status ?? "disconnected",
    isDefault: !!row.is_default,
    isActive: row.is_active !== false,
    sector: row.sector ?? null,
    defaultAssigneeId: row.default_assignee_id ?? null,
    baseUrl: row.base_url ?? null,
    webhookSecret: row.webhook_secret ?? null,
    lastStatusAt: row.last_status_at ?? null,
  };
}

export function useWhatsappConnections() {
  const { organizationId } = useCrmContext();
  return useQuery({
    queryKey: ["crm-connections", organizationId],
    queryFn: async (): Promise<WhatsappConnection[]> => {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select("id, display_name, instance_name, phone_number, status, is_default, is_active, sector, default_assignee_id, base_url, webhook_secret, last_status_at")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapConnection);
    },
    enabled: !isDemoMode() && !!organizationId,
    staleTime: 20_000,
  });
}

/** Resumo de todas as conexões WhatsApp da organização atual. */
export function useConnectionStatus(): {
  connected: boolean;
  status: string;
  connectedCount: number;
  total: number;
} {
  const { data } = useWhatsappConnections();
  if (isDemoMode()) return { connected: false, status: "disconnected", connectedCount: 0, total: 0 };
  const rows = data ?? [];
  const connectedCount = rows.filter((row) => row.status === "connected").length;
  const connected = connectedCount > 0;
  return {
    connected,
    status: connected ? "connected" : rows.some((row) => row.status === "connecting") ? "connecting" : "disconnected",
    connectedCount,
    total: rows.length,
  };
}
