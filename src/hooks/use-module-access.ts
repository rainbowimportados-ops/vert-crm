import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AppModule {
  id: string;
  key: string;
  name: string;
  description: string;
  status: 'developing' | 'testing' | 'ready' | 'published' | 'deactivated';
  visibility: 'developer' | 'admin' | 'tester' | 'all';
}

let cachedModules: AppModule[] | null = null;
let modulesFetchPromise: Promise<AppModule[]> | null = null;

async function fetchModulesOnce(): Promise<AppModule[]> {
  if (cachedModules) return cachedModules;
  if (modulesFetchPromise) return modulesFetchPromise;
  
  modulesFetchPromise = (async () => {
    try {
      const { data } = await supabase
        .from("app_modules")
        .select("*")
        .order("name");
      cachedModules = (data as AppModule[]) || [];
    } catch {
      cachedModules = [];
    }
    modulesFetchPromise = null;
    return cachedModules;
  })();
  return modulesFetchPromise;
}

export function useModuleAccess() {
  const { role, isDeveloper, isTester, isAdmin } = useAuth();
  const [modules, setModules] = useState<AppModule[]>(cachedModules || []);
  const [loading, setLoading] = useState(!cachedModules);

  const fetchModules = useCallback(async () => {
    setLoading(true);
    cachedModules = null;
    modulesFetchPromise = null;
    const data = await fetchModulesOnce();
    setModules(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (cachedModules) {
      setModules(cachedModules);
      setLoading(false);
      return;
    }
    fetchModulesOnce().then((data) => {
      setModules(data);
      setLoading(false);
    });
  }, []);

  const canViewModule = useCallback(
    (moduleKey: string): boolean => {
      // super_admin / admin / developer bypass all module restrictions
      if (role === 'super_admin' || isAdmin || isDeveloper) return true;

      const mod = modules.find(m => m.key === moduleKey);
      if (!mod) return true; // Default true for modules not yet in the table

      if (mod.status === 'deactivated') return false;

      // Check visibility
      if (mod.visibility === 'developer' && !isDeveloper) return false;
      if (mod.visibility === 'admin' && !isAdmin && !isDeveloper) return false;
      if (mod.visibility === 'tester' && !isTester && !isAdmin && !isDeveloper) return false;

      return true;
    },
    [modules, role, isDeveloper, isTester, isAdmin]
  );

  return { modules, loading, canViewModule, refetch: fetchModules };
}
