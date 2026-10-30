import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

export interface CrmGeneralSettings {
  clinicName: string;
  timezone: string;
  language: string;
  defaultCity: string;
  businessHoursEnabled: boolean;
}

export interface CrmNotificationSettings {
  newMessage: boolean;
  assignment: boolean;
  mention: boolean;
  followup: boolean;
  campaignFinished: boolean;
  sound: boolean;
  desktop: boolean;
}

export interface CrmIntegrationSettings {
  n8nWebhookUrl: string;
  n8nEnabled: boolean;
  aiEnabled: boolean;
  syncTags: boolean;
}

type ManifestRecord = Record<string, unknown> & {
  generalSettings?: Partial<CrmGeneralSettings>;
  notificationSettings?: Partial<CrmNotificationSettings>;
  integrationSettings?: Partial<CrmIntegrationSettings>;
  customFields?: unknown[];
  leadFields?: string[];
};

export function useCrmSettingsActions() {
  const { installationId, organizationId, manifest } = useCrmContext();
  const queryClient = useQueryClient();

  const saveManifest = async (patch: Partial<ManifestRecord>) => {
    const current = manifest as unknown as ManifestRecord;
    const next: ManifestRecord = {
      ...current,
      ...patch,
      generalSettings: patch.generalSettings
        ? { ...(current.generalSettings ?? {}), ...patch.generalSettings }
        : current.generalSettings,
      notificationSettings: patch.notificationSettings
        ? {
            ...(current.notificationSettings ?? {}),
            ...patch.notificationSettings,
          }
        : current.notificationSettings,
      integrationSettings: patch.integrationSettings
        ? {
            ...(current.integrationSettings ?? {}),
            ...patch.integrationSettings,
          }
        : current.integrationSettings,
    };
    const { error } = await supabase
      .from("crm_installations")
      .update({ manifest: next as never })
      .eq("id", installationId)
      .eq("organization_id", organizationId);
    if (error) throw error;
    await queryClient.invalidateQueries({
      queryKey: ["crm-installation", organizationId],
    });
    return next;
  };

  const saveInstallationName = async (name: string) => {
    const { error } = await supabase
      .from("crm_installations")
      .update({ name })
      .eq("id", installationId)
      .eq("organization_id", organizationId);
    if (error) throw error;
    await queryClient.invalidateQueries({
      queryKey: ["crm-installation", organizationId],
    });
  };

  return { saveManifest, saveInstallationName };
}

export function readManifestSettings(manifest: unknown) {
  const value = (manifest ?? {}) as ManifestRecord;
  return {
    general: {
      clinicName: value.generalSettings?.clinicName ?? "",
      timezone: value.generalSettings?.timezone ?? "America/Sao_Paulo",
      language: value.generalSettings?.language ?? "pt-BR",
      defaultCity: value.generalSettings?.defaultCity ?? "",
      businessHoursEnabled: value.generalSettings?.businessHoursEnabled ?? true,
    } satisfies CrmGeneralSettings,
    notifications: {
      newMessage: value.notificationSettings?.newMessage ?? true,
      assignment: value.notificationSettings?.assignment ?? true,
      mention: value.notificationSettings?.mention ?? true,
      followup: value.notificationSettings?.followup ?? true,
      campaignFinished: value.notificationSettings?.campaignFinished ?? true,
      sound: value.notificationSettings?.sound ?? true,
      desktop: value.notificationSettings?.desktop ?? false,
    } satisfies CrmNotificationSettings,
    integrations: {
      n8nWebhookUrl: value.integrationSettings?.n8nWebhookUrl ?? "",
      n8nEnabled: value.integrationSettings?.n8nEnabled ?? false,
      aiEnabled: value.integrationSettings?.aiEnabled ?? true,
      syncTags: value.integrationSettings?.syncTags ?? false,
    } satisfies CrmIntegrationSettings,
  };
}
