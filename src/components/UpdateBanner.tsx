import { usePwaUpdate } from "@/hooks/use-pwa-update";
import { RefreshCw, X, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function UpdateBanner() {
  const { needRefresh, applyUpdate } = usePwaUpdate();
  const [latestVersion, setLatestVersion] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function fetchVersion() {
      const { data } = await supabase
        .from("app_versions")
        .select("*")
        .eq("is_active", true)
        .order("released_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        const lastSeen = localStorage.getItem("last_seen_version");
        if (lastSeen !== data.version) {
          setLatestVersion(data);
        }
      }
    }
    fetchVersion();
  }, []);

  const handleDismiss = () => {
    if (latestVersion) {
      localStorage.setItem("last_seen_version", latestVersion.version);
    }
    setDismissed(true);
  };

  if (needRefresh) {
    return (
      <div
        className="fixed left-0 right-0 z-[100]"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="bg-primary text-white px-4 py-3 flex items-center justify-between gap-3 text-sm shadow-xl animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="bg-white/20 p-1.5 rounded-full">
              <RefreshCw className="h-4 w-4 animate-spin" />
            </div>
            <span className="font-bold truncate">Nova atualização disponível!</span>
          </div>
          <button
            onClick={applyUpdate}
            className="flex items-center gap-1.5 bg-white text-primary hover:bg-white/90 px-4 py-2 rounded-[10px] font-bold text-xs transition-all shadow-md active:scale-95 whitespace-nowrap"
          >
            Atualizar Agora
          </button>
        </div>
      </div>
    );
  }

  if (latestVersion && !dismissed) {
    return (
      <div
        className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-80 z-[100] animate-in slide-in-from-bottom duration-500"
      >
        <div className="bg-white rounded-[20px] p-4 shadow-2xl border border-border/40 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <button 
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          
          <div className="flex flex-col gap-1 pr-6">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Novo em {latestVersion.version}</span>
            <h4 className="font-bold text-foreground">Atualização disponível</h4>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {latestVersion.description || "Clique para ver as novidades desta versão."}
            </p>
            <button 
              onClick={handleDismiss}
              className="mt-3 text-primary text-xs font-bold flex items-center gap-1 hover:underline w-fit"
            >
              Entendi
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
