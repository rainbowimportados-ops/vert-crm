import { useState, useEffect, useRef, useCallback } from "react";
import { registerSW } from "virtual:pwa-register";

const shouldDisablePwa = () => {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  // Desativa apenas em previews/sandbox/dev. O domínio publicado
  // (vertcontrol.lovable.app, institutovert.app) DEVE ter SW ativo
  // para que o PWA instalado receba updates via onNeedRefresh.
  const isPreviewHost =
    host.includes("lovableproject.com") ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "localhost" ||
    host === "127.0.0.1";
  let isInIframe = true;
  try {
    isInIframe = window.self !== window.top;
  } catch {
    isInIframe = true;
  }
  return isPreviewHost || isInIframe;
};

// Caches reconhecidos pela versão atual do app (qualquer outro será apagado
// APENAS quando houver update real detectado pelo SW).
const CURRENT_CACHE_ALLOWLIST = [
  "vert-gestao-v5-precache",
  "vert-html-v5",
];

async function purgeStaleAppCaches() {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((name) => {
        // Só limpa caches do próprio app (prefixo vert-); nunca workers externos.
        if (!name.startsWith("vert-")) return Promise.resolve(true);
        const isCurrent = CURRENT_CACHE_ALLOWLIST.some((prefix) => name.startsWith(prefix));
        return isCurrent ? Promise.resolve(true) : caches.delete(name);
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Recupera a página quando um pedaço do app não existe mais no servidor.
 *
 * As bibliotecas pesadas (planilha, PDF, gráficos) deixaram de ser
 * pré-baixadas e passaram a chegar sob demanda. Isso abre uma janela: se
 * alguém está com o sistema aberto há horas e um deploy novo entra, os
 * arquivos que a aba dela conhece deixam de existir com aquele nome. Ao clicar
 * em "exportar", o import dinâmico falharia com um erro incompreensível.
 *
 * Aqui a falha vira um recarregamento, uma vez só — a marca no sessionStorage
 * impede laço infinito caso o erro tenha outra causa.
 */
function recuperarDeChunkFaltando() {
  const MARCA = "vert-recarregado-por-chunk";
  const ehFalhaDeChunk = (motivo: unknown) => {
    const texto = String((motivo as any)?.message ?? motivo ?? "");
    return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i.test(texto);
  };
  const tratar = (motivo: unknown) => {
    if (!ehFalhaDeChunk(motivo)) return;
    if (sessionStorage.getItem(MARCA)) return;
    sessionStorage.setItem(MARCA, "1");
    window.location.reload();
  };
  const onRejection = (e: PromiseRejectionEvent) => tratar(e.reason);
  const onError = (e: ErrorEvent) => tratar(e.message);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);
  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError);
  };
}

export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  // Vale mesmo com o PWA desligado: o erro de chunk vem do deploy, não do SW.
  useEffect(() => recuperarDeChunkFaltando(), []);

  useEffect(() => {
    if (shouldDisablePwa()) return;

    const update = registerSW({
      onNeedRefresh() {
        // Única fonte de verdade: o SW disse que há build novo.
        purgeStaleAppCaches();
        setNeedRefresh(true);
      },
      onOfflineReady() {},
    });
    updateRef.current = update;

    // Procura atualização assim que o app abre, e depois de minuto em minuto.
    //
    // Antes a checagem só acontecia quando a aba voltava ao foco. Na prática,
    // quem deixa o sistema aberto o dia inteiro — que é o caso da recepção —
    // podia passar horas numa versão antiga sem nunca ver o aviso. E como a
    // aplicação só ocorria ao SAIR da aba, era preciso sair, voltar e sair de
    // novo para receber a versão nova. Daí a impressão de que nada subia.
    update(false).catch(() => {});
    const INTERVALO_DE_CHECAGEM = 60 * 1000;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") update(false).catch(() => {});
    }, INTERVALO_DE_CHECAGEM);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        update(false).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    // Fluxo nativo do vite-pwa: ativa o novo SW e recarrega de forma coordenada.
    try {
      if (updateRef.current) {
        await Promise.race([
          updateRef.current(true),
          new Promise((res) => setTimeout(res, 2000)),
        ]);
      }
    } catch { /* ignore */ }
    // Fallback se o reload do vite-pwa não rodar.
    window.location.reload();
  }, []);

  // Aplicação automática e invisível: quando há update pendente e o usuário
  // SAI da aba (troca de aba / minimiza), aplicamos e recarregamos — ele volta
  // já na versão nova, sem interromper nada que estivesse fazendo. Isso evita
  // clientes presos em versões antigas (fonte dos erros de chunk) sem depender
  // do clique no banner, que continua disponível para aplicar na hora.
  useEffect(() => {
    if (!needRefresh) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        applyUpdate();
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [needRefresh, applyUpdate]);

  return { needRefresh, applyUpdate };
}
