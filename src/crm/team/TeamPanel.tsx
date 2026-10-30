import { useMemo, useState } from "react";
import {
  Building2,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  MoreVertical,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTeam, useTeamActions, type TeamMember } from "../services/team";
import { useCrmContext } from "../provider/CrmProvider";
import {
  CrmEmpty,
  CrmPageHeader,
  CrmStatCard,
  CrmStatus,
  CrmTableFooter,
} from "../ui/CrmUi";

const PERMS = [
  { key: "inbox", label: "Caixa de entrada" },
  { key: "conversations", label: "Conversas" },
  { key: "contacts", label: "Pacientes" },
  { key: "leads", label: "Leads" },
  { key: "campaigns", label: "Campanhas" },
  { key: "reports", label: "Relatórios" },
  { key: "settings", label: "Configurações" },
];

type TeamFilter = "all" | "active" | "inactive";

export function TeamPanel() {
  const { toast } = useToast();
  const { data: members, isLoading } = useTeam();
  const { create, update } = useTeamActions();
  const { connections } = useCrmContext();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<TeamFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>([
    "inbox",
    "conversations",
    "contacts",
  ]);
  const [newConnectionIds, setNewConnectionIds] = useState<string[]>(() =>
    connections.map((connection) => connection.id),
  );
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const search = query.toLowerCase();
    return (members ?? []).filter((member) => {
      const matchesSearch = `${member.name} ${member.email}`
        .toLowerCase()
        .includes(search);
      const matchesStatus =
        filter === "all" ||
        (filter === "active" ? member.active : !member.active);
      return matchesSearch && matchesStatus;
    });
  }, [members, query, filter]);

  const admins = (members ?? []).filter((member) =>
    ["admin", "super_admin", "gestor"].includes(member.role),
  ).length;

  const toggleNewPermission = (key: string) => {
    setNewPerms((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const toggleNewConnection = (connectionId: string) => {
    setNewConnectionIds((current) =>
      current.includes(connectionId)
        ? current.filter((id) => id !== connectionId)
        : [...current, connectionId],
    );
  };

  const save = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      toast({
        title: "Preencha nome, e-mail e senha (mín. 6 dígitos)",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      await create({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        permissions: newPerms,
        connectionIds: newConnectionIds,
      });
      toast({
        title: "Membro criado",
        description: `${fullName.trim()} já pode acessar o CRM.`,
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setNewPerms(["inbox", "conversations", "contacts"]);
      setNewConnectionIds(connections.map((connection) => connection.id));
      setForm(false);
    } catch (error: unknown) {
      toast({
        title: "Erro ao criar",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível criar o usuário.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (member: TeamMember) => {
    setBusyId(member.userId);
    try {
      await update(member.userId, { active: !member.active });
      toast({
        title: member.active ? "Usuário desativado" : "Usuário ativado",
      });
    } catch (error: unknown) {
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o usuário.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggleMemberPermission = async (member: TeamMember, key: string) => {
    const permissions = member.permissions.includes(key)
      ? member.permissions.filter((permission) => permission !== key)
      : [...member.permissions, key];
    setBusyId(member.userId);
    try {
      await update(member.userId, { permissions });
      toast({ title: "Permissões atualizadas" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao salvar",
        description:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar as permissões.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggleMemberConnection = async (member: TeamMember, connectionId: string) => {
    const connectionIds = member.connectionIds.includes(connectionId)
      ? member.connectionIds.filter((id) => id !== connectionId)
      : [...member.connectionIds, connectionId];
    setBusyId(member.userId);
    try {
      await update(member.userId, { connectionIds });
      toast({ title: "Acesso ao painel atualizado" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Não foi possível atualizar os painéis.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full space-y-6 p-5 lg:p-8">
      <CrmPageHeader
        title="Usuários"
        subtitle="Gerencie os usuários da clínica"
        search={query}
        onSearch={setQuery}
        placeholder="Buscar usuário..."
        onFilter={() => setFiltersOpen((open) => !open)}
        primaryLabel="Novo Usuário"
        onPrimary={() => setForm((open) => !open)}
      />

      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">
            Status:
          </span>
          {(
            [
              ["all", "Todos"],
              ["active", "Ativos"],
              ["inactive", "Inativos"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                filter === value
                  ? "border-primary bg-accent text-primary-dark"
                  : "border-border bg-white text-muted-foreground hover:bg-background",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmStatCard
          icon={Users}
          label="Total de Usuários"
          value={(members ?? []).length}
          helper="Usuários cadastrados"
        />
        <CrmStatCard
          icon={CheckCircle2}
          label="Usuários Ativos"
          value={(members ?? []).filter((member) => member.active).length}
          helper="Ativos no sistema"
          tone="green"
        />
        <CrmStatCard
          icon={ShieldCheck}
          label="Administradores"
          value={admins}
          helper="Com acesso total"
        />
        <CrmStatCard
          icon={Mail}
          label="Convites Pendentes"
          value="0"
          helper="Aguardando aceitação"
        />
      </div>

      {form && (
        <div className="rounded-xl border border-border bg-background p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Nome completo"
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm"
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="E-mail"
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Senha (mín. 6 dígitos)"
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm"
            />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-sidebar-foreground">
              Áreas liberadas:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PERMS.map((permission) => {
                const selected = newPerms.includes(permission.key);
                return (
                  <button
                    key={permission.key}
                    type="button"
                    onClick={() => toggleNewPermission(permission.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition",
                      selected
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-white text-muted-foreground",
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {permission.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-sidebar-foreground">
              Painéis do WhatsApp liberados:
            </p>
            <div className="flex flex-wrap gap-2">
              {connections.map((connection) => {
                const selected = newConnectionIds.includes(connection.id);
                return (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => toggleNewConnection(connection.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition",
                      selected
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-white text-muted-foreground",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", connection.status === "connected" ? "bg-green-500" : "bg-gray-400")} />
                    {selected && <Check className="h-3 w-3" />}
                    {connection.displayName}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => void save()}
              disabled={creating}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm text-white disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Criar login
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="hidden grid-cols-[1.5fr_.8fr_.8fr_1fr_.7fr_.8fr_.45fr_.3fr] border-b border-accent px-5 py-4 text-xs font-medium xl:grid">
          <span>Usuário</span>
          <span>Unidade</span>
          <span>Função</span>
          <span>Áreas de acesso</span>
          <span>Status</span>
          <span>Último acesso</span>
          <span>2FA</span>
          <span>Ações</span>
        </div>
        {isLoading ? (
          <div className="flex min-h-52 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <CrmEmpty title="Nenhum usuário encontrado" />
        ) : (
          rows.map((member) => (
            <div
              key={member.userId}
              className="border-b border-accent last:border-b-0"
            >
              <div className="grid gap-3 px-5 py-3.5 xl:grid-cols-[1.5fr_.8fr_.8fr_1fr_.7fr_.8fr_.45fr_.3fr] xl:items-center">
                <div className="min-w-0">
                  <strong className="block truncate text-sm">
                    {member.name || member.email}
                  </strong>
                  <small className="block truncate text-[11px] text-muted-foreground">
                    {member.email}
                  </small>
                </div>
                <span className="flex items-center gap-1.5 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {member.connectionIds.length === connections.length
                    ? "Todos os painéis"
                    : `${member.connectionIds.length} de ${connections.length}`}
                </span>
                <CrmStatus>
                  {["admin", "super_admin", "gestor"].includes(member.role)
                    ? "Administrador"
                    : "Atendente"}
                </CrmStatus>
                <span className="truncate text-sm">
                  {member.permissions
                    .map(
                      (permission) =>
                        PERMS.find((item) => item.key === permission)?.label,
                    )
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(", ") || "Atendimento"}
                </span>
                <button
                  onClick={() => void toggleActive(member)}
                  disabled={busyId === member.userId}
                  className="justify-self-start disabled:opacity-60"
                >
                  <CrmStatus tone={member.active ? "green" : "red"}>
                    {member.active ? "Ativo" : "Inativo"}
                  </CrmStatus>
                </button>
                <span className="text-sm text-muted-foreground">—</span>
                <ShieldCheck className="h-5 w-5 text-success" />
                <button
                  onClick={() =>
                    setEditingId((current) =>
                      current === member.userId ? null : member.userId,
                    )
                  }
                  title="Gerenciar permissões"
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              {editingId === member.userId && (
                <div className="border-t border-accent bg-background px-5 py-4">
                  <p className="mb-2 text-xs font-medium text-sidebar-foreground">
                    Permissões de {member.name || member.email}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PERMS.map((permission) => {
                      const selected = member.permissions.includes(
                        permission.key,
                      );
                      return (
                        <button
                          key={permission.key}
                          onClick={() =>
                            void toggleMemberPermission(member, permission.key)
                          }
                          disabled={busyId === member.userId}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition disabled:opacity-60",
                            selected
                              ? "border-primary bg-accent text-accent-foreground"
                              : "border-border bg-white text-muted-foreground",
                          )}
                        >
                          {selected && <Check className="h-3 w-3" />}
                          {permission.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mb-2 mt-4 text-xs font-medium text-sidebar-foreground">
                    Painéis do WhatsApp
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {connections.map((connection) => {
                      const selected = member.connectionIds.includes(connection.id);
                      return (
                        <button
                          key={connection.id}
                          onClick={() => void toggleMemberConnection(member, connection.id)}
                          disabled={busyId === member.userId}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:opacity-60",
                            selected
                              ? "border-primary bg-accent text-accent-foreground"
                              : "border-border bg-white text-muted-foreground",
                          )}
                        >
                          <span className={cn("h-2 w-2 rounded-full", connection.status === "connected" ? "bg-green-500" : "bg-gray-400")} />
                          {selected && <Check className="h-3 w-3" />}
                          {connection.displayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <CrmTableFooter
          text={`Mostrando ${rows.length} de ${(members ?? []).length} usuários`}
        />
      </div>
    </div>
  );
}
