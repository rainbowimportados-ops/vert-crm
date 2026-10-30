import type { CrmManifest } from "./types";

/** Manifesto padrão — usado como fallback se a instalação não trouxer um. */
export const DEFAULT_MANIFEST: CrmManifest = {
  applicationKey: "core-crm",
  name: "CRM",
  branding: {
    logo: null,
    primaryColor: "#9A603D",
    sidebarColor: "#151514",
    backgroundColor: "#FBFAF8",
    borderRadius: "12px",
    fontFamily: "Inter",
  },
  modules: {
    inbox: true,
    conversations: true,
    contacts: true,
    leads: true,
    campaigns: true,
    reports: true,
    settings: true,
    team: true,
    aiAssistant: true,
  },
  integrations: { patients: false, agenda: false, procedures: false, budgets: false },
  terminology: {
    customer: "Paciente", lead: "Lead", service: "Procedimento",
    location: "Unidade", appointment: "Agendamento", estimate: "Orçamento",
  },
  leadFields: ["interest", "city", "unit", "interestLevel", "mainObjection"],
  tags: [],
  statuses: ["novo", "em_atendimento", "aguardando", "finalizado"],
  quickActions: ["Agendar avaliação", "Enviar valores", "Mais informações"],
};

/** Mescla o manifesto vindo do banco com o padrão (tolerante a campos ausentes). */
export function normalizeManifest(raw: unknown): CrmManifest {
  const manifest = (raw ?? {}) as Partial<CrmManifest>;
  const incomingBranding = manifest.branding ?? {};
  const primaryColor = incomingBranding.primaryColor?.toUpperCase() === "#25A35F"
    ? DEFAULT_MANIFEST.branding.primaryColor
    : incomingBranding.primaryColor;

  return {
    ...DEFAULT_MANIFEST,
    ...manifest,
    branding: {
      ...DEFAULT_MANIFEST.branding,
      ...incomingBranding,
      ...(primaryColor ? { primaryColor } : {}),
    },
    modules: { ...DEFAULT_MANIFEST.modules, ...(manifest.modules ?? {}) },
    integrations: { ...DEFAULT_MANIFEST.integrations, ...(manifest.integrations ?? {}) },
    terminology: { ...DEFAULT_MANIFEST.terminology, ...(manifest.terminology ?? {}) },
    leadFields: manifest.leadFields?.length ? manifest.leadFields : DEFAULT_MANIFEST.leadFields,
    statuses: manifest.statuses?.length ? manifest.statuses : DEFAULT_MANIFEST.statuses,
    quickActions: manifest.quickActions?.length ? manifest.quickActions : DEFAULT_MANIFEST.quickActions,
    tags: manifest.tags ?? [],
  };
}

/** Converte #RRGGBB para "H S% L%" (formato dos tokens Tailwind/HSL do sistema). */
export function hexToHslString(hex: string): string | null {
  const clean = hex.replace("#", "").trim();
  if (![3, 6].includes(clean.length)) return null;
  const full = clean.length === 3 ? clean.split("").map((character) => character + character).join("") : clean;
  const red = parseInt(full.slice(0, 2), 16) / 255;
  const green = parseInt(full.slice(2, 4), 16) / 255;
  const blue = parseInt(full.slice(4, 6), 16) / 255;
  if ([red, green, blue].some((number) => Number.isNaN(number))) return null;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  let hue = 0, saturation = 0;
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case red: hue = (green - blue) / delta + (green < blue ? 6 : 0); break;
      case green: hue = (blue - red) / delta + 2; break;
      default: hue = (red - green) / delta + 4; break;
    }
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

/** Converte o branding do manifesto em variáveis escopadas ao módulo CRM. */
export function brandingToCssVars(manifest: CrmManifest): Record<string, string> {
  const vars: Record<string, string> = {
    "--card": "30 33% 99%",
    "--card-foreground": "24 8% 10%",
    "--popover": "30 33% 99%",
    "--popover-foreground": "24 8% 10%",
    "--secondary": "28 25% 94%",
    "--secondary-foreground": "24 18% 22%",
    "--muted": "28 24% 95%",
    "--muted-foreground": "24 7% 44%",
    "--accent": "27 34% 92%",
    "--accent-foreground": "24 35% 28%",
    "--border": "28 25% 88%",
    "--input": "28 25% 88%",
    "--sidebar-foreground": "30 25% 93%",
    "--sidebar-accent": "26 12% 19%",
    "--sidebar-accent-foreground": "30 25% 95%",
    "--sidebar-border": "26 12% 19%",
  };
  const primary = hexToHslString(manifest.branding.primaryColor);
  const sidebar = hexToHslString(manifest.branding.sidebarColor);
  const background = hexToHslString(manifest.branding.backgroundColor);
  if (primary) {
    vars["--primary"] = primary;
    vars["--ring"] = primary;
    vars["--sidebar-primary"] = primary;
    vars["--sidebar-ring"] = primary;
  }
  if (sidebar) vars["--sidebar-background"] = sidebar;
  if (background) vars["--background"] = background;
  if (manifest.branding.borderRadius) vars["--radius"] = manifest.branding.borderRadius;
  return vars;
}
