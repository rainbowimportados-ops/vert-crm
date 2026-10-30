import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Loader2, PlugZap } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ClinicPickerGate } from "@/components/ClinicPickerGate";
import { CrmProvider } from "@/crm/provider/CrmProvider";
import { CrmShell } from "@/crm/shell/CrmShell";

/**
 * VERT CRM — atendimento de pacientes pelo WhatsApp.
 *
 * App independente, com banco Supabase próprio (VITE_SUPABASE_URL /
 * VITE_SUPABASE_PUBLISHABLE_KEY). Rotas: /login, /reset-password e o CRM em
 * tela cheia na raiz. Qualquer outra rota cai na raiz.
 */

const Login = lazy(() => import("@/pages/Login"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Carregando() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function SemInstalacao() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <PlugZap className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">Nenhuma instalação de CRM encontrada</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Sua conta ainda não está vinculada a uma instalação do CRM. Peça a um administrador para liberar o seu acesso.
      </p>
    </div>
  );
}

/** Conta sem clínica vinculada: o CRM não cria clínica, só um administrador adiciona a pessoa à equipe. */
function SemClinica() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="text-sm font-medium text-foreground">Sua conta ainda não está ligada a uma clínica</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Peça a um administrador para te adicionar à equipe do CRM.
      </p>
      <button
        onClick={() => signOut()}
        className="mt-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        Sair
      </button>
    </div>
  );
}

function Crm() {
  const { signOut } = useAuth();
  return (
    <div className="fixed inset-0 bg-background">
      <CrmProvider loading={<Carregando />} fallback={<SemInstalacao />}>
        <CrmShell onExit={() => signOut()} />
      </CrmProvider>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <ThemeProvider>
                <UpdateBanner />
                <ClinicPickerGate>
                  <Suspense fallback={<Carregando />}>
                    <Routes>
                      <Route path="/login" element={<Login />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/onboarding" element={<SemClinica />} />
                      <Route
                        path="/"
                        element={
                          <ProtectedRoute moduleKey="crm">
                            <Crm />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </ClinicPickerGate>
              </ThemeProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
