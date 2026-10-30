import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";

/**
 * Tela de quem entrou pelo Google e ainda não foi liberado.
 *
 * Antes, uma conta Google sem cadastro nem chegava aqui: um gatilho no banco
 * derrubava a criação do usuário e a tela de login mostrava só "Erro ao entrar
 * com Google", sem dizer o motivo nem o que fazer. Agora a conta é criada, mas
 * nasce sem organização — e como toda política de leitura filtra por
 * organização, ela não enxerga nenhum dado enquanto espera.
 *
 * O e-mail aparece de propósito: quem entrou com a conta pessoal em vez da
 * conta da clínica descobre o engano sem precisar perguntar a ninguém.
 */
export function AguardandoLiberacao() {
  const { user, signOut } = useAuth();
  const email = user?.email ?? "";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-5 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Aguardando liberação</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta foi criada e está esperando um administrador liberar o acesso.
            Assim que isso acontecer, é só entrar de novo.
          </p>
        </div>

        {email && (
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-left">
            <p className="text-xs text-muted-foreground">Conta usada para entrar</p>
            <p className="mt-0.5 break-all text-sm font-medium">{email}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Entrou com a conta errada? Saia e tente com o e-mail da clínica.
        </p>

        <Button variant="outline" className="w-full" onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}
