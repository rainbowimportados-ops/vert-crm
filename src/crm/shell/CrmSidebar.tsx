import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronDown,
  ChevronsUpDown,
  Megaphone,
  MessageCircleMore,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { CrmModuleKey } from "../sdk/types";
import { useCrmContext } from "../provider/CrmProvider";
import { canAccessCrmModule } from "../sdk/access";
import { useInboxCounts } from "../services/conversations";

export type CrmSection =
  | "inbox"
  | "contacts"
  | "leads"
  | "campaigns"
  | "reports"
  | "settings"
  | "team";

export interface CrmNavItem {
  id: string;
  section: CrmSection;
  module: CrmModuleKey;
  label: string;
  icon: typeof MessagesSquare;
}

export const CRM_NAV: CrmNavItem[] = [
  {
    id: "conversations",
    section: "inbox",
    module: "conversations",
    label: "Conversas",
    icon: MessagesSquare,
  },
  {
    id: "leads",
    section: "leads",
    module: "leads",
    label: "Leads",
    icon: Users,
  },
  {
    id: "contacts",
    section: "contacts",
    module: "contacts",
    label: "Pacientes",
    icon: Users,
  },
  {
    id: "campaigns",
    section: "campaigns",
    module: "campaigns",
    label: "Campanhas",
    icon: Megaphone,
  },
  {
    id: "reports",
    section: "reports",
    module: "reports",
    label: "Relatórios",
    icon: BarChart3,
  },
  {
    id: "team",
    section: "team",
    module: "team",
    label: "Usuários",
    icon: ShieldCheck,
  },
  {
    id: "settings",
    section: "settings",
    module: "settings",
    label: "Configurações",
    icon: Settings,
  },
];

export function canAccessCrmNav(
  item: CrmNavItem,
  role: string,
  permissions: string[],
) {
  if (item.id === "conversations") {
    return (
      canAccessCrmModule("inbox", role, permissions) ||
      canAccessCrmModule("conversations", role, permissions)
    );
  }
  return canAccessCrmModule(item.module, role, permissions);
}

export function CrmSidebar({
  activeId,
  onSelect,
  connected = false,
}: {
  activeId: string;
  onSelect: (item: CrmNavItem) => void;
  connected?: boolean;
}) {
  const {
    manifest,
    role,
    installationName,
    permissions,
    connections,
    activeConnection,
    activeConnectionId,
    setActiveConnectionId,
  } = useCrmContext();
  const [panelsOpen, setPanelsOpen] = useState(false);
  const counts = useInboxCounts();
  const items = CRM_NAV.filter((item) =>
    item.id === "conversations"
      ? manifest.modules.inbox || manifest.modules.conversations
      : manifest.modules[item.module],
  ).filter((item) => canAccessCrmNav(item, role, permissions));

  return (
    /* A casca do CRM é escura de propósito nos dois temas: ela emoldura o painel
       claro em vez de acompanhá-lo. Não há token equivalente — os tokens de sidebar
       são claros no tema claro — então o hex fica, documentado. Se um dia a casca
       passar a seguir o tema, isto vira token junto. */
    <aside className="flex h-full w-[72px] flex-none flex-col justify-between bg-gradient-to-b from-[#111312] to-[#1b1c1a] text-white md:w-[238px]">
      <div className="min-h-0 overflow-y-auto">
        <div className="flex h-[126px] items-center px-4 md:px-7">
          <div className="hidden md:block">
            <div className="text-[38px] font-light leading-none tracking-[.18em] text-accent">
              VERT
            </div>
            <div className="mt-2 text-[9px] tracking-[.11em] text-accent">
              INSTITUTO ODONTOLÓGICO
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 text-lg text-accent md:hidden">
            V
          </div>
        </div>
        <div className="relative px-2.5 pb-4">
          <button
            type="button"
            onClick={() => connections.length > 1 && setPanelsOpen((open) => !open)}
            title={activeConnection?.displayName ?? "Selecionar painel do WhatsApp"}
            aria-expanded={panelsOpen}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.06] px-3 py-3 text-left transition hover:bg-white/[.1] md:px-4"
          >
            <span className="relative flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary text-white">
              <MessageCircleMore className="h-4 w-4" />
              <i
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#171816]",
                  activeConnection?.status === "connected" ? "bg-success" : "bg-white/35",
                )}
              />
            </span>
            <span className="hidden min-w-0 flex-1 md:block">
              <small className="block text-[10px] uppercase tracking-[.12em] text-white/45">Painel ativo</small>
              <strong className="mt-0.5 block truncate text-sm font-medium">
                {activeConnection?.displayName ?? "Sem WhatsApp liberado"}
              </strong>
              {activeConnection?.phoneNumber && (
                <small className="block truncate text-[11px] text-white/55">{activeConnection.phoneNumber}</small>
              )}
            </span>
            {connections.length > 1 && <ChevronsUpDown className="hidden h-4 w-4 flex-none text-white/60 md:block" />}
          </button>

          {panelsOpen && connections.length > 1 && (
            <div className="absolute left-2.5 top-[calc(100%-10px)] z-50 w-[300px] overflow-hidden rounded-xl border border-white/10 bg-[#242522] p-2 shadow-2xl md:left-3 md:w-[calc(100%-24px)]">
              <div className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-[.13em] text-white/45">
                Trocar de CRM
              </div>
              {connections.map((connection) => {
                const selected = connection.id === activeConnectionId;
                return (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => {
                      setActiveConnectionId(connection.id);
                      setPanelsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition",
                      selected ? "bg-primary text-white" : "text-white/85 hover:bg-white/[.08]",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full", connection.status === "connected" ? "bg-success" : "bg-white/30")} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-medium">{connection.displayName}</strong>
                      <small className="block truncate text-[11px] text-white/60">
                        {connection.phoneNumber ?? connection.instanceName ?? "Numero nao informado"}
                      </small>
                    </span>
                    {selected && <span className="text-[10px] font-semibold uppercase">Ativo</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <nav className="space-y-2 px-2.5 pb-4">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                title={item.label}
                className={cn(
                  "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-[15px] transition md:px-4",
                  active
                    ? "bg-gradient-to-r from-primary to-primary font-medium shadow-elevation-md"
                    : "text-white/90 hover:bg-white/[.07]",
                )}
              >
                <Icon className="h-[21px] w-[21px] flex-none stroke-[1.7]" />
                <span className="hidden truncate md:block">{item.label}</span>
                {item.id === "conversations" && counts.unread > 0 && (
                  <b className="ml-auto hidden min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] md:block">
                    {counts.unread > 99 ? "99+" : counts.unread}
                  </b>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-3 md:px-5 md:pb-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary text-sm font-semibold uppercase">
            {role.charAt(0)}
          </div>
          <div className="hidden min-w-0 flex-1 md:block">
            <div className="truncate text-sm font-medium">
              {installationName}
            </div>
            <div className="truncate text-xs capitalize text-white/60">
              {role === "admin" ? "Administrador" : role}
            </div>
          </div>
          <ChevronDown className="hidden h-4 w-4 md:block" />
        </div>
        <div className="mt-4 hidden items-center gap-2 pl-10 text-xs text-white/85 md:flex">
          {connected ? (
            <Wifi className="h-4 w-4 text-success" />
          ) : (
            <WifiOff className="h-4 w-4 text-white/40" />
          )}
          {connected ? "WhatsApp Conectado" : "WhatsApp Desconectado"}
        </div>
      </div>
    </aside>
  );
}
