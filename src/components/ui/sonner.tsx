import { useEffect, useState } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

/**
 * Superfície única de notificação do sistema.
 *
 * O projeto tinha duas — a do Radix (`toaster.tsx` + `use-toast.ts`) e esta —
 * e as duas renderizavam `null`, então nenhuma ação devolvia confirmação.
 * Em vez de ressuscitar as duas e passar a ter duas pilhas de toast em cantos
 * diferentes da tela, tudo converge para cá: `use-toast.ts` reencaminha para
 * este mesmo `toast`, e os ~94 arquivos que já chamavam um ou outro continuam
 * funcionando sem alteração.
 *
 * Contrato do design system (MASTER.md §2): auto-dismiss em 4s, `aria-live`
 * polite (o sonner aplica sozinho), nunca rouba foco.
 */

function useIsDark() {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

const Toaster = () => {
  const isDark = useIsDark();

  return (
    <SonnerToaster
      theme={isDark ? "dark" : "light"}
      // Canto inferior direito: convenção, e fora do caminho do conteúdo.
      position="bottom-right"
      // O produto é em português; o rótulo da região viva também.
      containerAriaLabel="Notificações"
      duration={4000}
      closeButton
      // Cor semântica no erro e no sucesso, sempre acompanhada do texto —
      // a mesma regra que a régua de preços segue (ARCHITECTURE.md §6).
      richColors
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-border/70 !font-sans !shadow-elevation-lg",
          title: "!text-sm !font-medium !leading-snug",
          description: "!text-sm !leading-snug",
        },
      }}
    />
  );
};

export { Toaster, toast };
