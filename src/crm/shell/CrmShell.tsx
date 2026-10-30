import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { SkeletonPage } from "@/components/ui/skeletons";
import {
  canAccessCrmNav,
  CrmSidebar,
  CRM_NAV,
  type CrmNavItem,
} from "./CrmSidebar";
import { ConversationQueue } from "../inbox/ConversationQueue";
import { ConversationPanel } from "../conversation/ConversationPanel";
import { useCrmContext } from "../provider/CrmProvider";
import { useCrmRealtime } from "../services/conversations";
import type { CrmConversation } from "../sdk/types";

/**
 * Conversas é a tela em que o CRM abre, então fica no pacote inicial. As outras
 * seis vêm sob demanda: antes, abrir o CRM baixava e executava as sete de uma
 * vez, e a mais cara é Relatórios, que traz o recharts junto — quem só queria
 * atender conversa pagava por uma biblioteca de gráficos que talvez nunca abra.
 *
 * Mesmo recurso que o `src/App.tsx` já usa para carregar o próprio CrmApp.
 */
const SettingsWorkspace = lazy(() =>
  import("../settings/SettingsWorkspace").then((m) => ({ default: m.SettingsWorkspace })),
);
const CampaignsPanel = lazy(() =>
  import("../campaigns/CampaignsPanel").then((m) => ({ default: m.CampaignsPanel })),
);
const ReportsPanel = lazy(() =>
  import("../reports/ReportsPanel").then((m) => ({ default: m.ReportsPanel })),
);
const ContactsPanel = lazy(() =>
  import("../contacts/ContactsPanel").then((m) => ({ default: m.ContactsPanel })),
);
const LeadsPanel = lazy(() =>
  import("../leads/LeadsPanel").then((m) => ({ default: m.LeadsPanel })),
);
const TeamPanel = lazy(() =>
  import("../team/TeamPanel").then((m) => ({ default: m.TeamPanel })),
);

export function CrmShell({ onExit }: { onExit?: () => void }) {
  const {
    installationName,
    manifest,
    permissions,
    role,
    activeConnectionId,
    activeConnection,
  } = useCrmContext();
  useCrmRealtime();
  const connected = activeConnection?.status === "connected";
  const allowedNav = useMemo(
    () =>
      CRM_NAV.filter((item) =>
        item.id === "conversations"
          ? manifest.modules.inbox || manifest.modules.conversations
          : manifest.modules[item.module],
      ).filter((item) => canAccessCrmNav(item, role, permissions)),
    [manifest.modules, permissions, role],
  );
  const [active, setActive] = useState<CrmNavItem>(
    () => allowedNav[0] ?? CRM_NAV[0],
  );
  const [selected, setSelected] = useState<CrmConversation | null>(null);

  useEffect(() => {
    if (!allowedNav.some((item) => item.id === active.id) && allowedNav[0]) {
      setActive(allowedNav[0]);
      setSelected(null);
    }
  }, [active.id, allowedNav]);

  useEffect(() => {
    setSelected(null);
  }, [activeConnectionId]);

  const openConversation = (conversation: CrmConversation) => {
    const item = allowedNav.find((navItem) => navItem.id === "conversations");
    if (!item) return;
    setSelected(conversation);
    setActive(item);
  };

  if (!allowedNav.length)
    return (
      <div className="flex h-full items-center justify-center bg-background p-6 text-center">
        <div>
          <p className="text-sm font-medium">CRM sem áreas liberadas</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Solicite a um administrador acesso ao CRM.
          </p>
          {onExit && (
            <button
              onClick={onExit}
              className="mt-4 rounded-xl border px-3 py-2 text-sm"
            >
              Voltar ao sistema
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div className="crm-shell flex h-full w-full overflow-hidden bg-background">
      <CrmSidebar
        activeId={active.id}
        connected={connected}
        onSelect={(item) => {
          setActive(item);
          setSelected(null);
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-white px-4 md:hidden">
          <span className="text-sm font-bold">{active.label}</span>
          {onExit && (
            <button
              onClick={onExit}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
            >
              <X className="h-4 w-4" />
              Sair
            </button>
          )}
        </header>
        {active.section === "inbox" ? (
          <div className="flex min-h-0 flex-1">
            <div
              className={cn("min-h-0", selected ? "hidden md:block" : "block")}
            >
              <ConversationQueue
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
            </div>
            <div
              className={cn(
                "min-h-0 flex-1",
                selected ? "flex" : "hidden md:flex",
              )}
            >
              <ConversationPanel
                conversation={selected}
                onBack={() => setSelected(null)}
              />
            </div>
          </div>
        ) : active.section === "settings" ? (
          <Suspense fallback={<SkeletonPage />}>
            <SettingsWorkspace key={active.id} initial="general" />
          </Suspense>
        ) : active.section === "contacts" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<SkeletonPage />}>
              <ContactsPanel onOpen={openConversation} />
            </Suspense>
          </div>
        ) : active.section === "leads" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<SkeletonPage />}>
              <LeadsPanel onOpen={openConversation} />
            </Suspense>
          </div>
        ) : active.section === "campaigns" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<SkeletonPage />}>
              <CampaignsPanel />
            </Suspense>
          </div>
        ) : active.section === "reports" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<SkeletonPage />}>
              <ReportsPanel />
            </Suspense>
          </div>
        ) : active.section === "team" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<SkeletonPage />}>
              <TeamPanel />
            </Suspense>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div>
              <p className="text-sm font-medium">{active.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Módulo de {installationName}.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
