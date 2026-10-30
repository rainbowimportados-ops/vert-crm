import { useState } from "react";
import {
  Bell,
  Bot,
  Clock3,
  MessageSquareText,
  Plug,
  Settings,
  ShieldCheck,
  Tag,
  UserRound,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionSettings } from "./ConnectionSettings";
import { AiAgentSettings } from "./AiAgentSettings";
import { AutoMessagesSettings } from "./AutoMessagesSettings";
import { QuickRepliesSettings } from "./QuickRepliesSettings";
import {
  CustomFieldsSettingsPanel,
  GeneralSettingsPanel,
  IntegrationsSettingsPanel,
  NotificationsSettingsPanel,
  PermissionsSettingsPanel,
  TagsSettingsPanel,
} from "./FunctionalSettingsPanels";
import { TeamPanel } from "../team/TeamPanel";

type Key =
  | "general"
  | "whatsapp"
  | "team"
  | "quick"
  | "tags"
  | "fields"
  | "automations"
  | "integrations"
  | "permissions"
  | "notifications"
  | "greeting"
  | "away";
const nav: { key: Key; label: string; icon: typeof Settings }[] = [
  { key: "general", label: "Geral", icon: Settings },
  { key: "whatsapp", label: "WhatsApp", icon: Plug },
  { key: "team", label: "Atendentes", icon: UserRound },
  { key: "quick", label: "Respostas Rápidas", icon: MessageSquareText },
  { key: "tags", label: "Etiquetas", icon: Tag },
  { key: "fields", label: "Campos Personalizados", icon: Wrench },
  { key: "automations", label: "Automação com IA", icon: Bot },
  { key: "integrations", label: "Integrações", icon: Plug },
  { key: "permissions", label: "Permissões", icon: ShieldCheck },
  { key: "notifications", label: "Notificações", icon: Bell },
  { key: "greeting", label: "Mensagens de Saudação", icon: MessageSquareText },
  { key: "away", label: "Mensagem de Ausência", icon: Clock3 },
];

export function SettingsWorkspace({ initial = "general" }: { initial?: Key }) {
  const [active, setActive] = useState<Key>(initial);
  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* A casca do CRM é escura de propósito nos dois temas: ela emoldura o painel
          claro em vez de acompanhá-lo. Não há token equivalente — os tokens de sidebar
          são claros no tema claro — então o hex fica, documentado. Se um dia a casca
          passar a seguir o tema, isto vira token junto. */}
      <aside className="hidden w-[230px] flex-none overflow-y-auto bg-[#1d1d1b] px-3 py-7 text-white lg:block">
        <h2 className="mb-5 px-3 text-xl font-semibold">Configurações</h2>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition",
                  active === item.key
                    ? "bg-gradient-to-r from-primary to-primary text-white"
                    : "text-white/88 hover:bg-white/[.07]",
                )}
              >
                <Icon className="h-[19px] w-[19px] stroke-[1.7]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="crm-settings-pane min-w-0 flex-1 overflow-y-auto">
        <div className="border-b border-border bg-white px-5 py-3 lg:hidden">
          <select
            value={active}
            onChange={(event) => setActive(event.target.value as Key)}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
          >
            {nav.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        {active === "general" && <GeneralSettingsPanel />}
        {active === "whatsapp" && <ConnectionSettings />}
        {active === "team" && <TeamPanel />}
        {active === "quick" && <QuickRepliesSettings />}
        {active === "tags" && <TagsSettingsPanel />}
        {active === "fields" && <CustomFieldsSettingsPanel />}
        {active === "automations" && <AiAgentSettings />}
        {active === "integrations" && <IntegrationsSettingsPanel />}
        {active === "permissions" && <PermissionsSettingsPanel />}
        {active === "notifications" && <NotificationsSettingsPanel />}
        {(active === "greeting" || active === "away") && (
          <AutoMessagesSettings only={active} />
        )}
      </div>
    </div>
  );
}
