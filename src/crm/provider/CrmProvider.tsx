import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CrmContextValue, CrmModuleKey } from "../sdk/types";
import { normalizeManifest, brandingToCssVars } from "../sdk/manifest";
import { hasCrmModulePermission } from "../sdk/access";

/** Exportado apenas para harnesses de preview/teste visual do tema. */
export const CrmContext = createContext<CrmContextValue | null>(null);

async function resolveProfile(orgId: string, role: string, userId: string) {
  const [instRes, memRes, connRes] = await Promise.all([
    supabase
      .from("crm_installations")
      .select("id, organization_id, unit_id, name, manifest")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("crm_members")
      .select("permissions, active")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("whatsapp_connections")
      .select("id, display_name, phone_number, instance_name, status, is_default, sector")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  if (instRes.error) throw instRes.error;
  if (connRes.error) throw connRes.error;
  const inst = instRes.data;
  if (!inst) return null;

  const member = memRes.data as { permissions: string[] | null; active: boolean | null } | null;
  const memberIsActive = member?.active ?? true;

  return {
    installationId: inst.id as string,
    applicationId: null as string | null,
    organizationId: inst.organization_id as string,
    unitId: (inst.unit_id as string) ?? null,
    role,
    permissions: (memberIsActive ? member?.permissions ?? [] : []) as string[],
    manifest: normalizeManifest(inst.manifest),
    installationName: inst.name as string,
    connections: (connRes.data ?? []).map((connection: any) => ({
      id: connection.id as string,
      displayName: connection.display_name || connection.phone_number || connection.instance_name || "WhatsApp",
      phoneNumber: connection.phone_number ?? null,
      instanceName: connection.instance_name ?? null,
      status: connection.status ?? "disconnected",
      isDefault: !!connection.is_default,
      sector: connection.sector ?? null,
    })),
  };
}

interface CrmProviderProps {
  children: ReactNode;
  loading?: ReactNode;
  fallback?: ReactNode;
}

export function CrmProvider({ children, loading, fallback }: CrmProviderProps) {
  const { user, organization, role } = useAuth();
  const userId = user?.id ?? null;
  const orgId = organization?.id ?? null;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["crm-installation", orgId, role, userId],
    queryFn: () => resolveProfile(orgId!, role ?? "atendente", userId!),
    enabled: !!userId && !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!data?.connections.length || !orgId) {
      setSelectedConnectionId(null);
      return;
    }
    const storageKey = `crm-active-connection:${orgId}`;
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(storageKey); } catch { /* storage indisponivel */ }
    setSelectedConnectionId((current) => {
      if (current && data.connections.some((connection) => connection.id === current)) return current;
      if (stored && data.connections.some((connection) => connection.id === stored)) return stored;
      return data.connections.find((connection) => connection.isDefault)?.id ?? data.connections[0].id;
    });
  }, [data?.connections, orgId]);

  const value = useMemo<CrmContextValue | null>(() => {
    if (!data || !userId) return null;
    const activeConnectionId =
      (selectedConnectionId && data.connections.some((connection) => connection.id === selectedConnectionId)
        ? selectedConnectionId
        : data.connections.find((connection) => connection.isDefault)?.id ?? data.connections[0]?.id) ?? null;
    const activeConnection = data.connections.find((connection) => connection.id === activeConnectionId) ?? null;
    return {
      ...data,
      userId,
      activeConnectionId,
      activeConnection,
      setActiveConnectionId: (connectionId: string) => {
        if (!data.connections.some((connection) => connection.id === connectionId)) return;
        setSelectedConnectionId(connectionId);
        try { window.localStorage.setItem(`crm-active-connection:${data.organizationId}`, connectionId); } catch { /* storage indisponivel */ }
      },
    };
  }, [data, selectedConnectionId, userId]);

  const cssVars = useMemo(
    () => (value ? brandingToCssVars(value.manifest) : {}),
    [value],
  );

  if (isLoading) return <>{loading ?? null}</>;
  if (isError || !value) return <>{fallback ?? null}</>;

  return (
    <CrmContext.Provider value={value}>
      <div className="crm-scope h-full" style={cssVars as React.CSSProperties}>
        {children}
      </div>
    </CrmContext.Provider>
  );
}

export function useCrmContext(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrmContext deve ser usado dentro de <CrmProvider>");
  return ctx;
}

export function useCrmCan(permission: string): boolean {
  const ctx = useContext(CrmContext);
  if (!ctx) return false;
  return hasCrmModulePermission(permission as CrmModuleKey, ctx.role, ctx.permissions);
}
