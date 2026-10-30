import { useEffect, useState, createContext, useContext, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ThemeSettings {
  id?: string;
  app_name?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
}

interface ThemeCtx {
  theme: ThemeSettings | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const Ctx = createContext<ThemeCtx>({ theme: null, loading: true, refetch: async () => {} });

function applyTheme(t: ThemeSettings | null) {
  const root = document.documentElement;
  if (t?.primary_color) root.style.setProperty("--primary", t.primary_color);
  if (t?.accent_color) root.style.setProperty("--accent", t.accent_color);
  if (t?.background_color) root.style.setProperty("--background", t.background_color);
  if (t?.favicon_url) {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = t.favicon_url;
  }
  if (t?.app_name) document.title = t.app_name;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("theme_settings")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTheme(data as ThemeSettings | null);
    applyTheme(data as ThemeSettings | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return <Ctx.Provider value={{ theme, loading, refetch: load }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
