import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  Webhook,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";
import { useTags, useTagActions } from "../services/atendimento";
import { useTeam, useTeamActions, type TeamMember } from "../services/team";
import {
  readManifestSettings,
  useCrmSettingsActions,
  type CrmGeneralSettings,
  type CrmIntegrationSettings,
  type CrmNotificationSettings,
} from "../services/settings";

const fieldClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";
const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary disabled:opacity-50";

function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-[30px] font-semibold tracking-[-.03em] text-card-foreground">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-5 shadow-elevation-md">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-card-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-accent py-3 last:border-0">
      <span>
        <strong className="block text-sm font-medium text-card-foreground">
          {label}
        </strong>
        {description && (
          <small className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </small>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 flex-none rounded-full transition",
          checked ? "bg-primary" : "bg-accent",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function GeneralSettingsPanel() {
  const { installationName, manifest } = useCrmContext();
  const { saveManifest, saveInstallationName } = useCrmSettingsActions();
  const { toast } = useToast();
  const [name, setName] = useState(installationName);
  const [form, setForm] = useState<CrmGeneralSettings>(() => ({
    ...readManifestSettings(manifest).general,
    clinicName:
      readManifestSettings(manifest).general.clinicName || installationName,
  }));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !form.clinicName.trim())
      return toast({
        title: "Informe o nome do CRM e da clínica",
        variant: "destructive",
      });
    setSaving(true);
    try {
      await Promise.all([
        saveInstallationName(name.trim()),
        saveManifest({ generalSettings: form }),
      ]);
      toast({ title: "Configurações gerais salvas" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao salvar",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 lg:p-8">
      <PanelHeader
        title="Configurações Gerais"
        subtitle="Defina as informações e o comportamento principal deste CRM."
        action={
          <button
            onClick={() => void save()}
            disabled={saving}
            className={primaryButton}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar alterações
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Identificação">
          <div className="space-y-4">
            <label className="block text-xs font-medium text-muted-foreground">
              Nome desta instalação
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={`${fieldClass} mt-1.5`}
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Nome da clínica
              <input
                value={form.clinicName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    clinicName: event.target.value,
                  }))
                }
                className={`${fieldClass} mt-1.5`}
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Cidade padrão
              <input
                value={form.defaultCity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultCity: event.target.value,
                  }))
                }
                placeholder="Ribeirão Preto"
                className={`${fieldClass} mt-1.5`}
              />
            </label>
          </div>
        </Section>
        <Section title="Localização e atendimento">
          <div className="space-y-4">
            <label className="block text-xs font-medium text-muted-foreground">
              Fuso horário
              <select
                value={form.timezone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                className={`${fieldClass} mt-1.5`}
              >
                <option value="America/Sao_Paulo">Brasília — São Paulo</option>
                <option value="America/Manaus">Manaus</option>
                <option value="America/Fortaleza">Fortaleza</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Idioma
              <select
                value={form.language}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    language: event.target.value,
                  }))
                }
                className={`${fieldClass} mt-1.5`}
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en-US">English</option>
                <option value="es">Español</option>
              </select>
            </label>
            <Toggle
              checked={form.businessHoursEnabled}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  businessHoursEnabled: value,
                }))
              }
              label="Respeitar horário de atendimento"
              description="Automações de saudação e ausência usam o horário configurado."
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

export function TagsSettingsPanel() {
  const { organizationId, installationId } = useCrmContext();
  const { data: tags, isLoading } = useTags();
  const { createTag } = useTagActions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#9A603C");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const rows = useMemo(
    () =>
      (tags ?? []).filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()),
      ),
    [tags, query],
  );
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["crm-tags", organizationId] });

  const create = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const id = await createTag(label.trim());
      await supabase
        .from("tags")
        .update({ color })
        .eq("id", id)
        .eq("organization_id", organizationId);
      await invalidate();
      setLabel("");
      toast({ title: "Etiqueta criada" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao criar",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string) => {
    if (!editingLabel.trim()) return;
    const { error } = await supabase
      .from("tags")
      .update({ label: editingLabel.trim() })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error)
      return toast({
        title: "Erro ao renomear",
        description: error.message,
        variant: "destructive",
      });
    await invalidate();
    setEditingId(null);
    toast({ title: "Etiqueta atualizada" });
  };

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("tags")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error)
      return toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    await invalidate();
    toast({ title: "Etiqueta excluída" });
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-import", {
        body: { installationId, include: "labels" },
      });
      if (error) throw error;
      await invalidate();
      toast({
        title: "Etiquetas sincronizadas",
        description: `${data?.labels ?? 0} etiquetas e ${data?.labelLinks ?? 0} vínculos atualizados a partir do WhatsApp.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Não foi possível sincronizar",
        description:
          error instanceof Error
            ? error.message
            : "Verifique a conexão do WhatsApp.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-5 lg:p-8">
      <PanelHeader
        title="Etiquetas"
        subtitle="Organize contatos e importe as etiquetas da conexão do WhatsApp."
        action={
          <button
            onClick={() => void sync()}
            disabled={syncing}
            className={primaryButton}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar do WhatsApp
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Section title="Nova etiqueta">
          <div className="space-y-3">
            <label className="block text-xs font-medium text-muted-foreground">
              Nome
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void create();
                }}
                placeholder="Ex.: Avaliação agendada"
                className={`${fieldClass} mt-1.5`}
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Cor
              <div className="mt-1.5 flex gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-11 w-14 rounded-lg border border-border bg-white p-1"
                />
                <input
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className={fieldClass}
                />
              </div>
            </label>
            <button
              onClick={() => void create()}
              disabled={busy || !label.trim()}
              className={`${primaryButton} w-full`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Criar etiqueta
            </button>
          </div>
        </Section>
        <Section
          title={`Etiquetas cadastradas (${tags?.length ?? 0})`}
          description="Pesquise, role a lista e edite qualquer etiqueta sem cortes."
        >
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar etiqueta…"
              className={`${fieldClass} pl-9`}
            />
          </div>
          <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex h-28 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nenhuma etiqueta encontrada.
              </div>
            ) : (
              rows.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-accent px-3 py-2.5"
                >
                  <span
                    className="h-3 w-3 flex-none rounded-full"
                    style={{ backgroundColor: item.color || "#9A603C" }}
                  />
                  {editingId === item.id ? (
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void rename(item.id);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border px-2 text-sm"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-card-foreground">
                      {item.label}
                    </span>
                  )}
                  <span className="flex gap-1">
                    {editingId === item.id ? (
                      <button
                        onClick={() => void rename(item.id)}
                        className="rounded-md p-1.5 text-success hover:bg-muted"
                        title="Salvar"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingLabel(item.label);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                        title="Renomear"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => void remove(item.id)}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

type CustomField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  required: boolean;
};

export function CustomFieldsSettingsPanel() {
  const { manifest } = useCrmContext();
  const { saveManifest } = useCrmSettingsActions();
  const { toast } = useToast();
  const existing =
    (manifest as unknown as { customFields?: CustomField[] }).customFields ??
    manifest.leadFields.map((key) => ({
      id: key,
      label: key,
      type: "text" as const,
      required: false,
    }));
  const [fields, setFields] = useState<CustomField[]>(existing);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomField["type"]>("text");
  const [saving, setSaving] = useState(false);
  const add = () => {
    const value = label.trim();
    if (!value) return;
    const id = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    if (fields.some((field) => field.id === id))
      return toast({ title: "Esse campo já existe", variant: "destructive" });
    setFields((current) => [
      ...current,
      { id, label: value, type, required: false },
    ]);
    setLabel("");
  };
  const save = async () => {
    setSaving(true);
    try {
      await saveManifest({
        customFields: fields,
        leadFields: fields.map((field) => field.id),
      });
      toast({ title: "Campos personalizados salvos" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao salvar",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="p-5 lg:p-8">
      <PanelHeader
        title="Campos Personalizados"
        subtitle="Defina as informações que serão registradas nos dados de cada lead e paciente."
        action={
          <button
            onClick={() => void save()}
            disabled={saving}
            className={primaryButton}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar campos
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Section title="Adicionar campo">
          <div className="space-y-3">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") add();
              }}
              placeholder="Nome do campo"
              className={fieldClass}
            />
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as CustomField["type"])
              }
              className={fieldClass}
            >
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="date">Data</option>
              <option value="select">Lista de opções</option>
            </select>
            <button
              onClick={add}
              disabled={!label.trim()}
              className={`${primaryButton} w-full`}
            >
              <Plus className="h-4 w-4" />
              Adicionar campo
            </button>
          </div>
        </Section>
        <Section title={`Campos ativos (${fields.length})`}>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-accent px-3 py-2.5"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="min-w-[160px] flex-1">
                  <strong className="block text-sm font-medium">
                    {field.label}
                  </strong>
                  <small className="text-[11px] text-muted-foreground">
                    {field.type}
                  </small>
                </span>
                <Toggle
                  checked={field.required}
                  onChange={(required) =>
                    setFields((current) =>
                      current.map((item) =>
                        item.id === field.id ? { ...item, required } : item,
                      ),
                    )
                  }
                  label="Obrigatório"
                />
                <button
                  onClick={() =>
                    setFields((current) =>
                      current.filter((item) => item.id !== field.id),
                    )
                  }
                  className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

const PERMISSIONS = [
  ["inbox", "Caixa de entrada"],
  ["conversations", "Conversas"],
  ["contacts", "Pacientes"],
  ["leads", "Leads"],
  ["campaigns", "Campanhas"],
  ["reports", "Relatórios"],
  ["settings", "Configurações"],
] as const;

export function PermissionsSettingsPanel() {
  const { data: members, isLoading } = useTeam();
  const { update } = useTeamActions();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (member: TeamMember, permission: string) => {
    const key = `${member.userId}:${permission}`;
    setBusy(key);
    const permissions = member.permissions.includes(permission)
      ? member.permissions.filter((item) => item !== permission)
      : [...member.permissions, permission];
    try {
      await update(member.userId, { permissions });
      toast({ title: "Permissão atualizada" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao atualizar",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="p-5 lg:p-8">
      <PanelHeader
        title="Permissões"
        subtitle="Controle exatamente quais áreas cada atendente pode acessar."
      />
      <Section
        title="Matriz de acesso"
        description="Administradores continuam com acesso total; as alterações abaixo são salvas imediatamente."
      >
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[220px_repeat(7,1fr)] border-b border-accent pb-3 text-center text-[11px] font-semibold text-muted-foreground">
              <span className="text-left">Usuário</span>
              {PERMISSIONS.map(([, label]) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {isLoading ? (
              <div className="flex h-36 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              (members ?? []).map((member) => (
                <div
                  key={member.userId}
                  className="grid grid-cols-[220px_repeat(7,1fr)] items-center border-b border-muted py-3 text-center last:border-0"
                >
                  <span className="min-w-0 pr-3 text-left">
                    <strong className="block truncate text-sm">
                      {member.name || member.email}
                    </strong>
                    <small className="block truncate text-[11px] text-muted-foreground">
                      {member.active ? "Ativo" : "Inativo"}
                    </small>
                  </span>
                  {PERMISSIONS.map(([key]) => {
                    const checked = member.permissions.includes(key);
                    const loading = busy === `${member.userId}:${key}`;
                    return (
                      <button
                        key={key}
                        onClick={() => void toggle(member, key)}
                        disabled={loading || !member.active}
                        aria-label={`${checked ? "Remover" : "Liberar"} ${key} para ${member.name || member.email}`}
                        className={cn(
                          "mx-auto flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:opacity-40",
                          checked
                            ? "border-primary bg-accent text-primary-dark"
                            : "border-border bg-white text-transparent hover:border-primary",
                        )}
                      >
                        {loading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

export function NotificationsSettingsPanel() {
  const { manifest } = useCrmContext();
  const { saveManifest } = useCrmSettingsActions();
  const { toast } = useToast();
  const [form, setForm] = useState<CrmNotificationSettings>(
    () => readManifestSettings(manifest).notifications,
  );
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification === "undefined" ? "denied" : Notification.permission,
  );
  const update = (key: keyof CrmNotificationSettings, value: boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      await saveManifest({ notificationSettings: form });
      toast({ title: "Preferências de notificação salvas" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao salvar",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  const requestDesktop = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") update("desktop", true);
  };
  return (
    <div className="p-5 lg:p-8">
      <PanelHeader
        title="Notificações"
        subtitle="Escolha quando o CRM deve avisar cada atendente."
        action={
          <button
            onClick={() => void save()}
            disabled={saving}
            className={primaryButton}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar preferências
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Eventos">
          <Toggle
            checked={form.newMessage}
            onChange={(value) => update("newMessage", value)}
            label="Nova mensagem recebida"
            description="Avise quando uma conversa precisar de resposta."
          />
          <Toggle
            checked={form.assignment}
            onChange={(value) => update("assignment", value)}
            label="Conversa atribuída"
          />
          <Toggle
            checked={form.mention}
            onChange={(value) => update("mention", value)}
            label="Menção em nota interna"
          />
          <Toggle
            checked={form.followup}
            onChange={(value) => update("followup", value)}
            label="Follow-up próximo"
          />
          <Toggle
            checked={form.campaignFinished}
            onChange={(value) => update("campaignFinished", value)}
            label="Campanha concluída"
          />
        </Section>
        <Section title="Canais">
          <Toggle
            checked={form.sound}
            onChange={(value) => update("sound", value)}
            label="Som no sistema"
          />
          <Toggle
            checked={form.desktop}
            onChange={(value) => update("desktop", value)}
            label="Notificação no computador"
            description={`Permissão do navegador: ${permission === "granted" ? "liberada" : permission === "denied" ? "bloqueada" : "não solicitada"}`}
          />
          {permission !== "granted" && (
            <button
              onClick={() => void requestDesktop()}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-primary-dark hover:bg-muted"
            >
              <Bell className="h-4 w-4" />
              Liberar notificações neste navegador
            </button>
          )}
        </Section>
      </div>
    </div>
  );
}

export function IntegrationsSettingsPanel() {
  const { manifest } = useCrmContext();
  const { saveManifest } = useCrmSettingsActions();
  const { toast } = useToast();
  const [form, setForm] = useState<CrmIntegrationSettings>(
    () => readManifestSettings(manifest).integrations,
  );
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await saveManifest({ integrationSettings: form });
      toast({ title: "Integrações salvas" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao salvar",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="p-5 lg:p-8">
      <PanelHeader
        title="Integrações"
        subtitle="Centralize WhatsApp, automações e IA sem expor credenciais no navegador."
        action={
          <button
            onClick={() => void save()}
            disabled={saving}
            className={primaryButton}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar integrações
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section
          title="n8n"
          description="Use um webhook de produção para receber eventos do CRM."
        >
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-muted p-3">
            <Webhook className="h-5 w-5 text-primary" />
            <span className="text-sm">
              <strong className="block">Automação externa</strong>
              <small className="text-muted-foreground">
                Mensagens, tags, leads e follow-ups
              </small>
            </span>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">
            URL do webhook
            <input
              type="url"
              value={form.n8nWebhookUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  n8nWebhookUrl: event.target.value,
                }))
              }
              placeholder="https://n8n.seudominio.com/webhook/..."
              className={`${fieldClass} mt-1.5`}
            />
          </label>
          <Toggle
            checked={form.n8nEnabled}
            onChange={(value) =>
              setForm((current) => ({ ...current, n8nEnabled: value }))
            }
            label="Enviar eventos ao n8n"
            description="A URL é salva na configuração da instalação."
          />
        </Section>
        <Section title="IA e sincronização">
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-accent p-3">
              <Bot className="h-5 w-5 text-primary" />
              <span className="flex-1 text-sm">
                <strong className="block">Assistente de IA</strong>
                <small className="text-muted-foreground">
                  Sugestões, resumo e análise de conversas
                </small>
              </span>
              {form.aiEnabled ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <CircleAlert className="h-5 w-5 text-warning" />
              )}
            </div>
            <Toggle
              checked={form.aiEnabled}
              onChange={(value) =>
                setForm((current) => ({ ...current, aiEnabled: value }))
              }
              label="Ativar IA assistiva"
            />
            <div className="flex items-center gap-3 rounded-lg border border-accent p-3">
              <Wifi className="h-5 w-5 text-primary" />
              <span className="flex-1 text-sm">
                <strong className="block">Etiquetas do WhatsApp</strong>
                <small className="text-muted-foreground">
                  Espelhamento bidirecional pela conexão Evolution
                </small>
              </span>
            </div>
            <Toggle
              checked={form.syncTags}
              onChange={(value) =>
                setForm((current) => ({ ...current, syncTags: value }))
              }
              label="Sincronizar etiquetas automaticamente"
            />
          </div>
        </Section>
      </div>
      <div className="mt-5 rounded-xl border border-border bg-background p-4 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mr-2 inline h-4 w-4 text-primary" />
        Tokens da Evolution, n8n e provedor de IA continuam protegidos no
        backend. Esta página salva apenas opções operacionais e URLs não
        secretas.
      </div>
    </div>
  );
}
