import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCcw, AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recovering: boolean;
}

// Erros de carregamento de bundle antigo em cache (chunk/módulo dinâmico que
// não existe mais após um deploy). São recuperáveis: basta limpar o cache do
// PWA e recarregar. Detectamos pela mensagem para tratar automaticamente.
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = `${error.name} ${error.message}`.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("loading chunk") ||
    msg.includes("chunkloaderror") ||
    msg.includes("unable to preload css")
  );
}

// Guarda de sessão: recupera automaticamente no máximo UMA vez, para nunca
// entrar em loop de reload caso o erro persista por outra causa.
const AUTO_RECOVER_KEY = "eb-auto-recover";

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    recovering: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, recovering: false };
  }

  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  public componentDidMount() {
    // Se a aplicação montou e ficou estável por alguns segundos, a recuperação
    // anterior (se houve) deu certo — liberamos a guarda para que um futuro
    // erro de cache (próximo deploy) possa se autorrecuperar de novo.
    this.clearTimer = setTimeout(() => {
      try { sessionStorage.removeItem(AUTO_RECOVER_KEY); } catch { /* ignore */ }
    }, 5000);
  }

  public componentWillUnmount() {
    if (this.clearTimer) clearTimeout(this.clearTimer);
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Nunca logamos dados sensíveis — apenas a mensagem técnica do erro.
    console.error("Uncaught error:", error, errorInfo);

    // Recuperação automática para erros de cache antigo do PWA: uma vez por
    // sessão, limpamos o service worker + caches e recarregamos. O usuário vê
    // um "Atualizando..." em vez da tela de falha.
    if (isChunkLoadError(error)) {
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(AUTO_RECOVER_KEY) === "1";
      } catch { /* ignore */ }
      if (!alreadyTried) {
        try { sessionStorage.setItem(AUTO_RECOVER_KEY, "1"); } catch { /* ignore */ }
        this.setState({ recovering: true });
        this.hardRecover(window.location.pathname + window.location.search);
      }
    }
  }

  private hardRecover = async (target: string) => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch { /* ignore */ }
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* ignore */ }
    const url = new URL(target, window.location.origin);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  };

  private handleReload = () => {
    this.hardRecover(window.location.pathname + window.location.search);
  };

  private handleReset = () => {
    this.hardRecover("/");
  };

  public render() {
    if (this.state.recovering) {
      return (
        <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background p-6 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mb-4" />
          <p className="text-sm text-muted-foreground">Atualizando para a versão mais recente…</p>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background p-6 text-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Algo deu errado
          </h1>
          <p className="text-muted-foreground max-w-md mb-8">
            Desculpe o transtorno. Ocorreu um erro inesperado na aplicação.
            Tente recarregar a página para continuar.
          </p>

          {this.state.error && (
            <div className="w-full max-w-2xl bg-muted p-4 rounded-lg mb-8 overflow-auto text-left">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Detalhe técnico (envie ao suporte)</p>
              <p className="text-xs font-mono text-destructive break-words">
                {this.state.error.toString()}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="default"
              onClick={this.handleReload}
              className="gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Recarregar Página
            </Button>
            <Button
              variant="outline"
              onClick={this.handleReset}
            >
              Voltar ao Início
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
