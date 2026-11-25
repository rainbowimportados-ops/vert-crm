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
  Sparkles,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { CrmModuleKey } from "../sdk/types";
import { useCrmContext } from "../provider/CrmProvider";
import { canAccessCrmModule } from "../sdk/access";
import { useInboxCounts } from "../services/conversations";
import { useSla } from "../services/sla";

export type CrmSection =
  | "inbox"
  | "ativacao"
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
    // usa a mesma permissão de Conversas: quem atende também faz o follow-up
    id: "ativacao",
    section: "ativacao",
    module: "conversations",
    label: "Ativar pacientes",
    icon: Sparkles,
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
  const sla = useSla();
  const items = CRM_NAV.filter((item) =>
    item.module === "conversations"
      ? manifest.modules.inbox || manifest.modules.conversations
      : manifest.modules[item.module],
  ).filter((item) => canAccessCrmNav(item, role, permissions));

  return (
    /* Casca clara, no tom do papel da marca: segue os tokens do tema. */
    <aside className="flex h-full w-[72px] flex-none flex-col justify-between border-r border-border bg-muted/50 text-foreground xl:w-[248px]">
      <div className="min-h-0 overflow-y-auto">
        <div className="flex h-[126px] items-center px-4 xl:px-7">
          <div className="hidden xl:block">
            <div className="text-[40px] font-light leading-none tracking-[.2em] text-foreground">
              VERT
            </div>
            <div className="mt-2 text-[10px] tracking-[.12em] text-foreground/75">
              INSTITUTO ODONTOLÓGICO
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-lg text-foreground xl:hidden">
            V
          </div>
        </div>
        <div className="relative px-2.5 pb-4">
          <button
            type="button"
            onClick={() => connections.length > 1 && setPanelsOpen((open) => !open)}
            title={activeConnection?.displayName ?? "Selecionar painel do WhatsApp"}
            aria-expanded={panelsOpen}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left shadow-elevation-sm transition hover:border-primary/40 xl:px-3.5"
          >
            <span className="relative flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MessageCircleMore className="h-4 w-4" />
              <i
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                  activeConnection?.status === "connected" ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
            </span>
            <span className="hidden min-w-0 flex-1 xl:block">
              <small className="block text-[10px] uppercase tracking-[.12em] text-muted-foreground">Painel ativo</small>
              <strong className="mt-0.5 block truncate text-sm font-medium">
                {activeConnection?.displayName ?? "Sem WhatsApp liberado"}
              </strong>
              {activeConnection?.phoneNumber && (
                <small className="block truncate text-[11px] text-muted-foreground">{activeConnection.phoneNumber}</small>
              )}
            </span>
            {connections.length > 1 && <ChevronsUpDown className="hidden h-4 w-4 flex-none text-muted-foreground xl:block" />}
          </button>

          {panelsOpen && connections.length > 1 && (
            <div className="absolute left-2.5 top-[calc(100%-10px)] z-50 w-[300px] overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-elevation-lg xl:left-3 xl:w-[calc(100%-24px)]">
              <div className="px-2 pb-2 pt-1 text-[10px] uppercase tracking-[.13em] text-muted-foreground">
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
                      selected ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full", connection.status === "connected" ? "bg-success" : "bg-muted-foreground/40")} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-medium">{connection.displayName}</strong>
                      <small className={cn("block truncate text-[11px]", selected ? "text-primary-foreground/75" : "text-muted-foreground")}>
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
                  "flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-[15px] transition xl:px-4",
                  active
                    ? "bg-primary font-medium text-primary-foreground shadow-elevation-md"
                    : "text-foreground/85 hover:bg-foreground/[.05] hover:text-foreground",
                )}
              >
                <Icon className="h-[21px] w-[21px] flex-none stroke-[1.7]" />
                <span className="hidden truncate xl:block">{item.label}</span>
                {item.id === "ativacao" && sla.atrasados > 0 && (
                  <b
                    title={`${sla.atrasados} paciente(s) sem resposta há mais de 15 min`}
                    className={cn(
                      "ml-auto hidden min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] xl:block",
                      active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-destructive text-destructive-foreground",
                    )}
                  >
                    {sla.atrasados > 99 ? "99+" : sla.atrasados}
                  </b>
                )}
                {item.id === "conversations" && counts.unread > 0 && (
                  <b className={cn("ml-auto hidden min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] xl:block", active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground")}>
                    {counts.unread > 99 ? "99+" : counts.unread}
                  </b>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-3 xl:px-5 xl:pb-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary text-sm font-semibold uppercase text-primary-foreground">
            {role.charAt(0)}
          </div>
          <div className="hidden min-w-0 flex-1 xl:block">
            <div className="truncate text-sm font-medium">
              {installationName}
            </div>
            <div className="truncate text-xs capitalize text-muted-foreground">
              {role === "admin" ? "Administrador" : role}
            </div>
          </div>
          <ChevronDown className="hidden h-4 w-4 xl:block" />
        </div>
        <div className="mt-4 hidden items-center gap-2 pl-10 text-xs text-foreground/80 xl:flex">
          {connected ? (
            <Wifi className="h-4 w-4 text-success" />
          ) : (
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          )}
          {connected ? "WhatsApp Conectado" : "WhatsApp Desconectado"}
        </div>
      </div>
    </aside>
  );
}
