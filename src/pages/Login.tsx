import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  Mail,
  Lock,
  ShieldCheck,
  CalendarCheck,
  MessageCircle,
  TrendingUp,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePwaUpdate } from "@/hooks/use-pwa-update";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Agenda inteligente",
    desc: "Consultas, retornos e encaixes em um só lugar",
  },
  {
    icon: MessageCircle,
    title: "CRM com WhatsApp",
    desc: "Atendimento e conversas integrados à clínica",
  },
  {
    icon: TrendingUp,
    title: "Financeiro em tempo real",
    desc: "Receitas, despesas e relatórios sempre atualizados",
  },
  {
    icon: Users,
    title: "Pacientes integrados",
    desc: "Histórico, orçamentos e exames conectados",
  },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signIn, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : null;
  const { toast } = useToast();
  const { needRefresh, applyUpdate } = usePwaUpdate();

  // Ao voltar para a tela (ex.: "voltar" depois do Google), destrava o botão
  useEffect(() => {
    const reset = () => setGoogleLoading(false);
    window.addEventListener("pageshow", reset);
    window.addEventListener("focus", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("focus", reset);
    };
  }, []);

  // Já logado (ex.: retorno do Google) → entra direto
  useEffect(() => {
    if (user) navigate(safeNext ?? "/agenda", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Erro vindo do redirect do Google (ex.: conta não autorizada)
  useEffect(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    if (/error/i.test(hash) || /error_description/i.test(search)) {
      const params = new URLSearchParams(hash.replace(/^#/, "") + "&" + search.replace(/^\?/, ""));
      const desc = params.get("error_description") || "";
      const naoAutorizada = /google_not_authorized|database error/i.test(desc);
      toast({
        title: naoAutorizada ? "Conta Google não autorizada" : "Erro ao entrar com Google",
        description: naoAutorizada
          ? "Essa conta Google não está cadastrada no sistema. Use o email cadastrado na clínica ou fale com o administrador."
          : desc || "Tente novamente.",
        variant: "destructive",
      });
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error, code, remaining } = await signIn(email, password);
    setLoading(false);
    if (error) {
      if (code === "blocked") {
        toast({
          title: "Conta bloqueada por segurança",
          description:
            "Muitas tentativas incorretas. Verifique o email de redefinição de senha que enviamos — ao criar a nova senha, a conta é desbloqueada.",
          variant: "destructive",
        });
      } else if (code === "reset_sent") {
        toast({
          title: "Enviamos um email para você",
          description:
            "Foram 3 tentativas incorretas. Verifique sua caixa de entrada e redefina sua senha. Atenção: mais um erro bloqueia a conta.",
          variant: "destructive",
        });
      } else if (code === "invalid_password" && typeof remaining === "number") {
        toast({
          title: "Email ou senha incorretos",
          description: `Você tem mais ${remaining} tentativa${remaining === 1 ? "" : "s"} antes do bloqueio.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao entrar",
          description: error.message || "Email ou senha incorretos.",
          variant: "destructive",
        });
      }
    } else {
      navigate(safeNext ?? "/agenda");
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    // Trava de segurança: se o redirecionamento não acontecer, destrava o botão
    window.setTimeout(() => setGoogleLoading(false), 12000);
    const { error } = await signInWithGoogle();
    if (error) {
      setGoogleLoading(false);
      toast({
        title: "Erro ao entrar com Google",
        description: error.message?.includes("not enabled")
          ? "O login com Google ainda não foi ativado nas configurações."
          : error.message,
        variant: "destructive",
      });
    }
    // Em caso de sucesso o navegador é redirecionado para o Google.
  };

  const handleForgot = async () => {
    if (!email) {
      toast({
        title: "Informe seu email",
        description: "Digite o email no campo acima para receber o link de redefinição.",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Erro ao enviar email", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email enviado", description: "Verifique sua caixa de entrada para redefinir a senha." });
    }
  };

  return (
    <AuthLayout
      srTitle="VERT GESTÃO — Sistema de Gestão Odontológica"
      headline={
        <>
          Sua clínica inteira,
          <br />
          em uma só tela.
        </>
      }
      sub="Agenda, pacientes, financeiro e atendimento no WhatsApp — tudo conectado, tudo em tempo real."
      features={FEATURES}
    >

      <div className="mb-7 text-center lg:text-left">
            <h2 className="text-[1.7rem] font-extrabold tracking-tight text-foreground">Bem-vindo de volta</h2>
            <p className="text-muted-foreground text-sm mt-1.5">Acesse sua conta para continuar</p>
          </div>

          {/* Google primeiro — padrão moderno */}
          <Button
            type="button"
            variant="outline"
            disabled={googleLoading}
            onClick={handleGoogle}
            className="w-full h-11 font-medium gap-2.5 rounded-xl border-border hover:bg-muted/60"
          >
            {googleLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            ) : (
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Continuar com Google
          </Button>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">ou entre com email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 pl-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Senha
                </Label>
                <button
                  type="button"
                  onClick={handleForgot}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pl-10 pr-10 rounded-xl"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary-dark font-semibold shadow-sm mt-1"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Entrando...
                </span>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center mt-6">
            Ainda não tem conta?{" "}
            <a href="/cadastro" className="text-primary hover:underline font-semibold">
              Cadastre-se grátis
            </a>
          </p>

          {needRefresh && (
            <Button type="button" variant="outline" className="w-full gap-2 mt-5 rounded-xl" onClick={applyUpdate}>
              <RefreshCw className="h-4 w-4" />
              Atualizar aplicativo
            </Button>
          )}

          {/* Rodapé */}
          <div className="mt-9 pt-5 border-t border-border/60 flex flex-col items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Acesso protegido — bloqueio automático após 3 tentativas incorretas</span>
            </div>
            <a
              href="/instalar"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Instalar o app no celular
            </a>
            <p className="text-xs text-muted-foreground">
              Problemas para acessar?{" "}
              <a href="mailto:admin@vertodonto.com.br" className="text-primary hover:underline">
                Contate o administrador
          </a>
        </p>
      </div>
    </AuthLayout>
  );
}
