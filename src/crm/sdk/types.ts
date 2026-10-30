// ============================================================
// CRM SDK — contratos de tipos (reutilizável entre instalações)
// Núcleo agnóstico: não importa nada específico de clínica.
// ============================================================

export type CrmModuleKey =
  | "inbox"
  | "conversations"
  | "contacts"
  | "leads"
  | "campaigns"
  | "reports"
  | "settings"
  | "team"
  | "aiAssistant";

export interface CrmBranding {
  logo: string | null;
  primaryColor: string;   // hex
  sidebarColor: string;   // hex
  backgroundColor: string; // hex
  borderRadius: string;   // ex "14px"
  fontFamily: string;
}

/** Integrações com módulos do sistema hospedeiro (clínica). Ausente = nicho sem esses módulos. */
export interface CrmIntegrations {
  patients: boolean;
  agenda: boolean;
  procedures: boolean;
  budgets: boolean;
}

/** Terminologia do nicho — permite reusar o núcleo trocando os rótulos. */
export interface CrmTerminology {
  customer: string;   // "Paciente" | "Cliente" | ...
  lead: string;
  service: string;    // "Procedimento" | "Produto" | ...
  location: string;   // "Unidade" | "Loja" | ...
  appointment: string;
  estimate?: string;  // "Orçamento"
}

export interface CrmManifest {
  applicationKey: string;
  applicationType?: string; // "dental_clinic" | "iphone_store" | ...
  name: string;
  branding: CrmBranding;
  modules: Record<CrmModuleKey, boolean>;
  integrations?: Partial<CrmIntegrations>;
  terminology?: Partial<CrmTerminology>;
  leadFields: string[];
  tags: { id?: string; label: string; color?: string }[];
  statuses: string[];
  quickActions: string[];
}

export interface CrmConnectionPanel {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  instanceName: string | null;
  status: string;
  isDefault: boolean;
  sector: string | null;
}

/** Contexto resolvido pelo backend (nunca confiar só no frontend). */
export interface CrmContextValue {
  installationId: string;
  applicationId: string | null;
  organizationId: string; // tenant
  unitId: string | null;
  userId: string;
  role: string;
  permissions: string[];
  manifest: CrmManifest;
  installationName: string;
  connections: CrmConnectionPanel[];
  activeConnectionId: string | null;
  activeConnection: CrmConnectionPanel | null;
  setActiveConnectionId: (connectionId: string) => void;
}

// ---------- Domínio (usado a partir da Fase 4) ----------

export type ConversationStatus =
  | "novo"
  | "em_atendimento"
  | "aguardando"
  | "finalizado";

export type MessageDirection = "in" | "out";
export type MessageDeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";
export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "contact"
  | "reaction";

export interface CrmContact {
  id: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  city: string | null;
  unit: string | null;
  patientId: string | null;
}

/** Etiqueta — espelha as etiquetas do WhatsApp (source = "whatsapp") ou criadas no CRM. */
export interface CrmTag {
  id: string;
  label: string;
  color: string | null;
  source?: string | null;
}

export interface CrmConversation {
  id: string;
  connectionId?: string | null;
  connectionName?: string | null;
  connectionPhone?: string | null;
  contact: CrmContact;
  /** Etiquetas do contato (vindas do WhatsApp quando source = "whatsapp"). */
  tags?: CrmTag[];
  status: ConversationStatus;
  lastMessage: string;
  lastMessageAt: string; // ISO
  unread: number;
  primaryTag: string | null;
  interest: string | null;
  assigneeName: string | null;
  priority: "baixa" | "media" | "alta" | null;
  isNewLead: boolean;
  isPatient: boolean;
  /** Agente de IA nesta conversa: segue o geral ("default"), forçado ligado ou desligado. */
  aiMode?: "default" | "on" | "off";
}

export interface CrmMessage {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  type: MessageType;
  content: string;
  mediaUrl?: string | null;
  createdAt: string; // ISO
  deliveryStatus: MessageDeliveryStatus;
}

export type InboxFilterKey =
  | "all"
  | "unread"
  | "patients"
  | "in_progress"
  | "waiting"
  | "closed"
  | "unassigned";
