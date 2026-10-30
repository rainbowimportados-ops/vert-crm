import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, KeyRound, ShieldCheck, MailCheck, Sparkles } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";

const FEATURES = [
  { icon: KeyRound, title: "Nova senha, novo começo", desc: "Escolha uma senha forte e fácil de lembrar" },
  { icon: ShieldCheck, title: "Conta desbloqueada", desc: "Ao salvar, qualquer bloqueio de segurança é removido" },
  { icon: MailCheck, title: "Link verificado", desc: "Este acesso veio do email cadastrado na sua conta" },
  { icon: Sparkles, title: "Pronto para usar", desc: "Você entra direto no sistema após salvar" },
];

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Supabase parses the recovery hash automatically and emits PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo de 6 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Senhas não conferem", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao atualizar senha", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Senha atualizada", description: "Você já está logado." });
    navigate("/agenda");
  };

  return (
    <AuthLayout
      srTitle="Definir nova senha — VERT CRM"
      headline={
        <>
          Vamos criar
          <br />
          sua nova senha.
        </>
      }
      sub="Por segurança, escolha uma senha que você não use em outros sites."
      features={FEATURES}
    >
      <div className="mb-7 text-center lg:text-left">
        <h2 className="text-[1.7rem] font-extrabold tracking-tight text-foreground">Definir nova senha</h2>
        <p className="text-muted-foreground text-sm mt-1.5">
          {ready ? "Escolha uma nova senha para sua conta." : "Validando link de recuperação..."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium">Nova senha</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              className="h-11 pl-10 rounded-xl"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-sm font-medium">Confirmar senha</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={6}
              required
              className="h-11 pl-10 rounded-xl"
            />
          </div>
        </div>
        <Button
          type="submit"
          disabled={loading || !ready}
          className="w-full h-11 rounded-xl bg-primary hover:bg-primary-dark font-semibold shadow-sm mt-1"
        >
          {loading ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>

      <div className="mt-9 pt-5 border-t border-border/60 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        <span>Ao salvar, a conta é desbloqueada e você entra automaticamente</span>
      </div>
    </AuthLayout>
  );
}
