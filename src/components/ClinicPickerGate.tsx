import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Organization } from "@/contexts/AuthContext";
import { Building2, Check, Loader2 } from "lucide-react";

const SESSION_KEY = "vert-clinica-escolhida";

/**
 * Portão multi-clínica: logo após o login, quem tem acesso a mais de
 * uma clínica escolhe em qual quer entrar. Quem tem uma só passa direto.
 * A escolha vale para a sessão do navegador (novo login pergunta de novo).
 */
export function ClinicPickerGate({ children }: { children: React.ReactNode }) {
  const { user, organization, refreshOrganization } = useAuth();
  const [chosen, setChosen] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["my-organizations", user?.id],
    enabled: !!user && !chosen,
    staleTime: 60_000,
    queryFn: async (): Promise<Organization[]> => {
      const { data, error } = await supabase.rpc("my_organizations" as never);
      if (error) throw error;
      return (data as Organization[]) ?? [];
    },
  });

  // Uma clínica só (ou deslogado): nada a perguntar.
  useEffect(() => {
    if (!user) { sessionStorage.removeItem(SESSION_KEY); setChosen(false); }
  }, [user]);
  useEffect(() => {
    if (user && !chosen && orgs && orgs.length <= 1) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setChosen(true);
    }
  }, [user, chosen, orgs]);

  if (!user || chosen) return <>{children}</>;
  if (isLoading || !orgs) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (orgs.length <= 1) return <>{children}</>;

  const enter = async (org: Organization) => {
    setBusyId(org.id);
    setError(null);
    try {
      if (org.id !== organization?.id) {
        const { error } = await supabase.rpc("set_active_organization" as never, { _org: org.id } as never);
        if (error) throw error;
        await refreshOrganization();
      }
      sessionStorage.setItem(SESSION_KEY, "1");
      // recarrega para todas as consultas nascerem já na clínica certa
      window.location.replace("/");
    } catch (e: any) {
      setError(e?.message || "Não foi possível entrar nesta clínica.");
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Em qual clínica você quer entrar?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Seu acesso vale para mais de uma clínica.</p>
        </div>

        <div className="space-y-2">
          {orgs.map((o) => {
            const atual = o.id === organization?.id;
            return (
              <button
                key={o.id}
                onClick={() => void enter(o)}
                disabled={!!busyId}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-md disabled:opacity-60"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                  {o.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{o.name}</span>
                  {atual && <span className="text-[11px] text-muted-foreground">última clínica usada</span>}
                </span>
                {busyId === o.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : atual ? (
                  <Check className="h-4 w-4 text-success" />
                ) : null}
              </button>
            );
          })}
        </div>

        {error && <p className="mt-3 text-center text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
