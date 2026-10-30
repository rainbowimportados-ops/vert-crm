import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CalendarClock, Lock, LogOut } from "lucide-react";

export function SubscriptionBlocked() {
  const { organization, signOut } = useAuth();

  const isExpiredTrial =
    organization?.status === "trial" &&
    new Date(organization.trial_ends_at).getTime() <= Date.now();

  const title = isExpiredTrial ? "Seu período de teste terminou" : "Assinatura suspensa";
  const description = isExpiredTrial
    ? "Os 14 dias grátis chegaram ao fim. Para continuar usando o sistema com todos os seus dados preservados, ative sua assinatura."
    : "O acesso desta organização está suspenso no momento. Se você acredita que isso é um engano ou quer reativar, fale com a gente.";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-5 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
          {isExpiredTrial ? (
            <CalendarClock className="h-6 w-6 text-muted-foreground" />
          ) : (
            <Lock className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {organization && (
            <p className="text-sm text-muted-foreground mt-1">{organization.name}</p>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="space-y-2 pt-2">
          <Button asChild className="w-full h-11">
            <a href="mailto:admin@vertodonto.com.br?subject=Ativar%20assinatura%20VERT%20GEST%C3%83O">
              Falar com o suporte para ativar
            </a>
          </Button>
          <Button variant="ghost" className="w-full gap-1.5 text-muted-foreground" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
            Sair da conta
          </Button>
        </div>
      </div>
    </div>
  );
}
