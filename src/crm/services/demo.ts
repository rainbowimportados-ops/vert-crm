import type { CrmConversation, CrmMessage } from "../sdk/types";

// Dados de demonstração — usados APENAS quando a URL contém ?demo=1.
// Serão substituídos por dados reais (Supabase) na Fase 4.
export const DEMO_CONVERSATIONS: CrmConversation[] = [
  {
    id: "c1",
    contact: { id: "p1", name: "Beatriz Almeida", phone: "+55 16 99999-1234", avatarUrl: null, city: "Franca", unit: "Franca", patientId: null },
    status: "novo",
    lastMessage: "Gostaria de informações sobre lentes.",
    lastMessageAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    unread: 2,
    primaryTag: "Lentes",
    interest: "Lentes de contato dental",
    assigneeName: null,
    priority: "alta",
    isNewLead: true,
    isPatient: false,
  },
  {
    id: "c2",
    contact: { id: "p2", name: "Carlos Mendes", phone: "+55 16 98888-4321", avatarUrl: null, city: "Ribeirão Preto", unit: "Franca", patientId: "demo-patient" },
    status: "em_atendimento",
    lastMessage: "Perfeito, quinta às 14h fica ótimo.",
    lastMessageAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    unread: 0,
    primaryTag: "Avaliação",
    interest: "Implante",
    assigneeName: "Ana (você)",
    priority: "media",
    isNewLead: false,
    isPatient: true,
  },
  {
    id: "c3",
    contact: { id: "p3", name: "Fernanda Rocha", phone: "+55 16 97777-5566", avatarUrl: null, city: "Franca", unit: "Franca", patientId: null },
    status: "aguardando",
    lastMessage: "Vou verificar minha agenda e retorno.",
    lastMessageAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    unread: 0,
    primaryTag: "Orçamento",
    interest: "Clareamento",
    assigneeName: "João",
    priority: "baixa",
    isNewLead: false,
    isPatient: true,
  },
];

export const DEMO_MESSAGES: Record<string, CrmMessage[]> = {
  c1: [
    { id: "m1", conversationId: "c1", direction: "in", type: "text", content: "Olá! Vi o anúncio de vocês.", createdAt: new Date(Date.now() - 8 * 60_000).toISOString(), deliveryStatus: "read" },
    { id: "m2", conversationId: "c1", direction: "in", type: "text", content: "Gostaria de informações sobre lentes.", createdAt: new Date(Date.now() - 5 * 60_000).toISOString(), deliveryStatus: "read" },
  ],
  c2: [
    { id: "m3", conversationId: "c2", direction: "in", type: "text", content: "Bom dia, consigo marcar avaliação?", createdAt: new Date(Date.now() - 60 * 60_000).toISOString(), deliveryStatus: "read" },
    { id: "m4", conversationId: "c2", direction: "out", type: "text", content: "Bom dia, Carlos! Temos quinta às 14h. Fica bom?", createdAt: new Date(Date.now() - 50 * 60_000).toISOString(), deliveryStatus: "read" },
    { id: "m5", conversationId: "c2", direction: "in", type: "text", content: "Perfeito, quinta às 14h fica ótimo.", createdAt: new Date(Date.now() - 42 * 60_000).toISOString(), deliveryStatus: "read" },
  ],
  c3: [
    { id: "m6", conversationId: "c3", direction: "out", type: "text", content: "Segue o orçamento do clareamento 😊", createdAt: new Date(Date.now() - 4 * 3600_000).toISOString(), deliveryStatus: "delivered" },
    { id: "m7", conversationId: "c3", direction: "in", type: "text", content: "Vou verificar minha agenda e retorno.", createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(), deliveryStatus: "read" },
  ],
};

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}
