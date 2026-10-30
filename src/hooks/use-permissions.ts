import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RolePermission {
  role: string;
  module_key: string;
  has_access: boolean;
}

// Module-level cache to avoid refetching on every hook mount
let cachedPermissions: RolePermission[] | null = null;
let permFetchPromise: Promise<RolePermission[]> | null = null;

async function fetchPermissionsOnce(): Promise<RolePermission[]> {
  if (cachedPermissions) return cachedPermissions;
  if (permFetchPromise) return permFetchPromise;
  permFetchPromise = (async () => {
    try {
      const { data } = await supabase
        .from("role_permissions")
        .select("role, module_key, has_access")
        .order("role");
      cachedPermissions = (data as RolePermission[]) || [];
    } catch {
      cachedPermissions = [];
    }
    permFetchPromise = null;
    return cachedPermissions;
  })();
  return permFetchPromise;
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<RolePermission[]>(cachedPermissions || []);
  const [loading, setLoading] = useState(!cachedPermissions);

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    // Invalidate cache to get fresh data
    cachedPermissions = null;
    permFetchPromise = null;
    const data = await fetchPermissionsOnce();
    setPermissions(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (cachedPermissions) {
      setPermissions(cachedPermissions);
      setLoading(false);
      return;
    }
    fetchPermissionsOnce().then((data) => {
      setPermissions(data);
      setLoading(false);
    });
  }, []);

  const hasAccess = useCallback(
    (role: string, moduleKey: string): boolean => {
      if (role === "super_admin" || role === "admin") return true;
      const perm = permissions.find(
        (p) => p.role === role && p.module_key === moduleKey
      );
      return perm?.has_access ?? false;
    },
    [permissions]
  );

  const togglePermission = async (
    role: string,
    moduleKey: string,
    newValue: boolean
  ) => {
    setPermissions((prev) => {
      const existing = prev.find(
        (p) => p.role === role && p.module_key === moduleKey
      );
      if (existing) {
        return prev.map((p) =>
          p.role === role && p.module_key === moduleKey
            ? { ...p, has_access: newValue }
            : p
        );
      }
      return [...prev, { role, module_key: moduleKey, has_access: newValue }];
    });

    const { error } = await supabase
      .from("role_permissions")
      .upsert(
        { role, module_key: moduleKey, has_access: newValue },
        { onConflict: "role,module_key" }
      );

    if (error) {
      fetchPermissions();
    } else {
      // Update cache
      cachedPermissions = null;
    }
  };

  return { permissions, loading, hasAccess, togglePermission, refetch: fetchPermissions };
}
