import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, isOrgActive } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/use-permissions";
import { useModuleAccess } from "@/hooks/use-module-access";
import { SubscriptionBlocked } from "@/components/SubscriptionBlocked";
import { AguardandoLiberacao } from "@/components/AguardandoLiberacao";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "financeiro" | "recepcao" | "doutor";
  moduleKey?: string;
  requireDeveloper?: boolean;
}

function AccessDenied({ reason }: { reason: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-4 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Acesso indisponível</h1>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <div className="flex gap-2 justify-center pt-2">
          <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
          <Button onClick={() => navigate("/")}>Ir para Início</Button>
        </div>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, requiredRole, moduleKey, requireDeveloper }: ProtectedRouteProps) {
  const { user, loading, role, isDeveloper, organization, orgLoaded, aguardandoLiberacao } = useAuth();
  const { hasAccess, loading: permLoading } = usePermissions();
  const { canViewModule, loading: moduleLoading } = useModuleAccess();

  if (loading || permLoading || moduleLoading || (user && !orgLoaded)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Antes do gate de organização: quem entrou pelo Google e ainda não foi
  // liberado NÃO pode cair no /onboarding, senão criaria a própria clínica.
  if (aguardandoLiberacao) return <AguardandoLiberacao />;

  // Gate SaaS: usuário sem organização vai para o onboarding;
  // organização com assinatura vencida/bloqueada vê a tela de reativação.
  // Super admin (dono da plataforma) nunca é bloqueado.
  if (role !== "super_admin") {
    if (!organization) return <Navigate to="/onboarding" replace />;
    if (!isOrgActive(organization)) return <SubscriptionBlocked />;
  }

  if (requiredRole && role !== requiredRole && role !== "admin" && role !== "super_admin") {
    return <AccessDenied reason="Você não tem permissão para acessar esta área." />;
  }

  // Restrito ao dono da plataforma: org admins comuns não entram aqui.
  if (requireDeveloper && !isDeveloper && role !== "super_admin") {
    return <AccessDenied reason="Área restrita ao administrador da plataforma." />;
  }

  if (moduleKey && role && (!hasAccess(role, moduleKey) || !canViewModule(moduleKey))) {
    return <AccessDenied reason="Este módulo ainda não está liberado para o seu usuário ou está em manutenção." />;
  }

  return <>{children}</>;
}
