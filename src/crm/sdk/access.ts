import type { CrmModuleKey } from "./types";

export const CRM_MANAGER_ROLES = ["admin", "super_admin", "gestor"] as const;

const CRM_PERMISSION_ALIASES: Record<CrmModuleKey, string[]> = {
  inbox: ["inbox", "crm-inbox", "crm:inbox"],
  conversations: ["conversations", "crm-conversations", "crm:conversations"],
  contacts: ["contacts", "crm-contacts", "crm:contacts"],
  leads: ["leads", "crm-leads", "crm:leads"],
  campaigns: ["campaigns", "crm-campaigns", "crm:campaigns"],
  reports: ["reports", "crm-reports", "crm:reports"],
  settings: ["settings", "crm-settings", "crm:settings"],
  team: ["team", "crm-team", "crm:team"],
  aiAssistant: [
    "aiAssistant",
    "ai-assistant",
    "crm-aiAssistant",
    "crm:aiAssistant",
    "crm-ai-assistant",
    "crm:ai-assistant",
  ],
};

export function isCrmManager(role: string): boolean {
  return CRM_MANAGER_ROLES.includes(role as (typeof CRM_MANAGER_ROLES)[number]);
}

export function hasCrmModulePermission(
  module: CrmModuleKey,
  role: string,
  permissions: string[],
): boolean {
  if (isCrmManager(role)) return true;
  return CRM_PERMISSION_ALIASES[module].some((permission) => permissions.includes(permission));
}

export function canAccessCrmModule(
  module: CrmModuleKey,
  role: string,
  permissions: string[],
): boolean {
  if (module === "team") return isCrmManager(role);
  return hasCrmModulePermission(module, role, permissions);
}
