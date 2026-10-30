import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Building2, Check, ChevronDown, Copy, Loader2, MessageCircleMore, Plus, QrCode,
  Save, Settings2, ShieldCheck, Star, Trash2, UserRound, Wifi, WifiOff,
} from "lucide-react";
import { useCrmContext } from "../provider/CrmProvider";
import { useWhatsappConnections } from "../services/connection";
import { QrConnectDialog } from "./QrConnectDialog";

export function ConnectionSettings() {
  const { organizationId, installationId, role } = useCrmContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = ["admin", "super_admin", "gestor"].includes(role);
  const { data: connections = [], isLoading } = useWhatsappConnections();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [instance, setInstance] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sector, setSector] = useState("");
  const [defaultAssigneeId, setDefaultAssigneeId] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInstance, setNewInstance] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newSector, setNewSector] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrTarget, setQrTarget] = useState<{ id: string; name: string; novo?: boolean } | null>(null);
  // Campos técnicos ficam recolhidos: no uso normal ninguém precisa deles.
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
  const { data: members = [] } = useQuery({
    queryKey: ["crm-connection-members", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, sector")
        .eq("organization_id", organizationId)
        .eq("is_blocked", false)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: canManage && !!organizationId,
  });
  const sectors = useMemo(
    () => Array.from(new Set(members.map((member) => member.sector?.trim()).filter(Boolean) as string[])).sort(),
    [members],
  );

  const selected = useMemo(
    () => connections.find((connection) => connection.id === selectedId) ?? connections[0] ?? null,
    [connections, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setDisplayName(selected.displayName);
    setInstance(selected.instanceName ?? "");
    setBaseUrl(selected.baseUrl ?? "");
    setApiKey("");
    setSector(selected.sector ?? "");
    setDefaultAssigneeId(selected.defaultAssigneeId ?? "");
  }, [selected?.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm-connections", organizationId] });
    qc.invalidateQueries({ queryKey: ["crm-connection", organizationId] });
    qc.invalidateQueries({ queryKey: ["crm-conversations", organizationId] });
  };

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const webhookUrl = selected?.webhookSecret
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook?connectionId=${selected.id}&secret=${selected.webhookSecret}`
    : "";

  const createConnection = async () => {
    if (!newName.trim() || !newInstance.trim()) {
      toast({ title: "Informe o nome e a instância", variant: "destructive" });
      return;
    }
    if (connections.length > 0 && !newApiKey.trim()) {
      toast({ title: "Informe a chave Evolution", description: "O segundo número precisa da chave global do servidor ou da chave da instância.", variant: "destructive" });
      return;
    }
    const createdName = newName.trim();
    setBusy("create");
    const { data, error } = await supabase
      .from("whatsapp_connections")
      .insert({
        organization_id: organizationId,
        installation_id: installationId,
        display_name: createdName,
        instance_name: newInstance.trim(),
        base_url: newBaseUrl.trim() || null,
        sector: newSector.trim() || null,
        default_assignee_id: newAssigneeId || null,
        is_default: connections.length === 0,
        is_active: true,
        status: "disconnected",
      } as any)
      .select("id")
      .single();
    if (!error && newApiKey.trim()) {
      const configured = await supabase.functions.invoke("crm-evolution", {
        body: { action: "configure", connectionId: data.id, apiKey: newApiKey.trim() },
      });
      if (configured.error || (configured.data as any)?.ok === false) {
        setBusy(null);
        toast({ title: "WhatsApp salvo, mas a chave não foi aceita", description: configured.error?.message || (configured.data as any)?.error, variant: "destructive" });
        setSelectedId(data.id);
        invalidate();
        return;
      }
    }
    setBusy(null);
    if (error) {
      toast({ title: "Não foi possível adicionar", description: error.message, variant: "destructive" });
      return;
    }
    setAdding(false);
    setNewName("");
    setNewInstance("");
    setNewBaseUrl("");
    setNewApiKey("");
    setNewSector("");
    setNewAssigneeId("");
    setSelectedId(data.id);
    invalidate();
    toast({ title: "WhatsApp adicionado", description: "Agora conecte o número pelo QR Code." });
    setQrTarget({ id: data.id, name: createdName });
  };

  /**
   * Conectar outro WhatsApp em um clique.
   *
   * Antes era preciso preencher nome, nome da instância, URL do servidor e
   * chave da Evolution ANTES de ver qualquer QR — quatro campos técnicos para
   * uma tarefa que, do ponto de vista de quem usa, é "ler um QR code".
   *
   * Agora a conexão nasce com o mínimo e o QR aparece imediatamente. A URL e a
   * chave ficam nulas de propósito: a crm-evolution cai em EVOLUTION_BASE_URL e
   * EVOLUTION_API_KEY (secrets das Edge Functions), então a credencial do
   * servidor nunca passa pelo navegador nem precisa ser digitada. Se ainda não
   * houver secret, herdamos a URL de uma conexão que já funciona.
   *
   * O nome é pedido depois do pareamento, quando o número já está identificado.
   */
  const conectarNovoWhatsApp = async () => {
    setBusy("create");

    // A URL vem do BANCO, não da lista em memória.
    //
    // Na primeira versão eu herdava de `connections`, que é a lista já filtrada
    // por is_active e servida pelo cache do React Query. Bastou o usuário ter
    // removido as conexões anteriores para a lista chegar vazia: a conexão
    // nasceu sem URL e o servidor respondeu "não está configurada". Consultando
    // o banco — e sem filtrar por is_active — a URL aparece mesmo que nenhuma
    // conexão esteja ativa no momento.
    const { data: referencia } = await supabase
      .from("whatsapp_connections")
      .select("base_url")
      .eq("organization_id", organizationId)
      .not("base_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const urlHerdada = (referencia as any)?.base_url ?? null;

    // Reaproveita uma conexão ainda não pareada em vez de criar outra a cada
    // clique. Dois cliques seguidos deixavam duas linhas órfãs para trás.
    const { data: pendente } = await supabase
      .from("whatsapp_connections")
      .select("id")
      .eq("organization_id", organizationId)
      .is("phone_number", null)
      .like("instance_name", "vert-%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendente) {
      await supabase
        .from("whatsapp_connections")
        .update({ is_active: true, base_url: urlHerdada, status: "disconnected" } as any)
        .eq("id", (pendente as any).id);
      setBusy(null);
      invalidate();
      setQrTarget({ id: (pendente as any).id, name: "Novo WhatsApp", novo: true });
      return;
    }

    // Quantas conexões existem de fato — pelo banco, porque é isto que decide se
    // a nova nasce como padrão. Marcar uma conexão vazia como padrão esconde o
    // histórico de quem já tinha conversas.
    const { count } = await supabase
      .from("whatsapp_connections")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    // Nome de instância único. Duas conexões com o mesmo nome disputam o mesmo
    // webhook na Evolution e as mensagens entram na conexão errada.
    const instanciaGerada = `vert-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await supabase
      .from("whatsapp_connections")
      .insert({
        organization_id: organizationId,
        installation_id: installationId,
        display_name: "Novo WhatsApp",
        instance_name: instanciaGerada,
        base_url: urlHerdada,
        is_default: (count ?? 0) === 0,
        is_active: true,
        status: "disconnected",
      } as any)
      .select("id")
      .single();
    setBusy(null);
    if (error || !data) {
      toast({ title: "Não foi possível iniciar a conexão", description: error?.message, variant: "destructive" });
      return;
    }
    invalidate();
    setQrTarget({ id: data.id, name: "Novo WhatsApp", novo: true });
  };

  const save = async () => {
    if (!selected) return;
    setBusy("save");
    const { error } = await supabase
      .from("whatsapp_connections")
      .update({
        display_name: displayName.trim() || "WhatsApp",
        instance_name: instance.trim() || null,
        base_url: baseUrl.trim() || null,
        sector: sector.trim() || null,
        default_assignee_id: defaultAssigneeId || null,
      } as any)
      .eq("id", selected.id);
    if (!error && apiKey.trim()) {
      const configured = await supabase.functions.invoke("crm-evolution", {
        body: { action: "configure", connectionId: selected.id, apiKey: apiKey.trim() },
      });
      if (configured.error || (configured.data as any)?.ok === false) {
        setBusy(null);
        toast({ title: "Dados salvos, mas a chave não foi aceita", description: configured.error?.message || (configured.data as any)?.error, variant: "destructive" });
        return;
      }
    }
    setBusy(null);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setApiKey("");
    invalidate();
    toast({ title: "Configuração salva" });
  };

  const removeConnection = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      `Remover ${selected.displayName} do CRM?\n\nO número deixará de receber e enviar mensagens pelo sistema. O histórico das conversas será preservado.`,
    );
    if (!confirmed) return;
    setBusy("remove");
    const { data, error } = await supabase.rpc("crm_remove_whatsapp_connection", {
      _connection: selected.id,
    } as any);
    setBusy(null);
    if (error || data !== true) {
      toast({ title: "Não foi possível remover", description: error?.message, variant: "destructive" });
      return;
    }
    setSelectedId(null);
    invalidate();
    toast({ title: "WhatsApp removido", description: "O histórico das conversas foi preservado." });
  };

  const makeDefault = async () => {
    if (!selected || selected.isDefault) return;
    setBusy("default");
    const clear = await supabase
      .from("whatsapp_connections")
      .update({ is_default: false } as any)
      .eq("organization_id", organizationId);
    const result = clear.error
      ? clear
      : await supabase.from("whatsapp_connections").update({ is_default: true } as any).eq("id", selected.id);
    setBusy(null);
    if (result.error) {
      toast({ title: "Não foi possível definir o padrão", description: result.error.message, variant: "destructive" });
      return;
    }
    invalidate();
    toast({ title: `${selected.displayName} agora é o WhatsApp padrão` });
  };

  // As fotos de perfil são baixadas em lotes para caber no tempo da função;
  // repetimos até a função dizer que não sobrou ninguém.
  // Desliga o número da instância sem apagar a conexão nem o histórico.
  // Para voltar, é só ler o QR de novo.
  const desconectar = async () => {
    if (!selected) return;
    setBusy("logout");
    const { data, error } = await supabase.functions.invoke("crm-evolution", {
      body: { action: "logout", connectionId: selected.id },
    });
    setBusy(null);
    if (error || (data as any)?.ok === false) {
      toast({
        title: "Não foi possível desconectar",
        description: error?.message || (data as any)?.error || "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
      return;
    }
    invalidate();
    toast({ title: `${selected.displayName} foi desconectado` });
  };


  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <div className="w-full max-w-6xl space-y-5 overflow-y-auto px-5 py-5 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">WhatsApps da clínica</h2>
          <p className="text-sm text-muted-foreground">Conecte e organize vários números no mesmo CRM.</p>
        </div>
        {canManage && (
          <button
            onClick={conectarNovoWhatsApp}
            disabled={busy === "create"}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Conectar outro WhatsApp
          </button>
        )}
      </div>

      {adding && (
        <div className="grid gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs font-medium">Identificação no CRM</label>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ex.: Recepção, Unidade Centro" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium">Nome da instância Evolution</label>
            <input value={newInstance} onChange={(event) => setNewInstance(event.target.value)} placeholder="Ex.: vert-centro" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium">URL Evolution (opcional)</label>
            <input value={newBaseUrl} onChange={(event) => setNewBaseUrl(event.target.value)} placeholder="Usa a URL padrão se ficar vazio" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium">Chave Evolution {connections.length > 0 ? "(obrigatória)" : "(opcional)"}</label>
            <input type="password" autoComplete="new-password" value={newApiKey} onChange={(event) => setNewApiKey(event.target.value)} placeholder="Chave global ou da instância" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium">Setor (opcional)</label>
            <input list="crm-sectors-new" value={newSector} onChange={(event) => setNewSector(event.target.value)} placeholder="Ex.: Recepção" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
            <datalist id="crm-sectors-new">{sectors.map((item) => <option key={item} value={item} />)}</datalist>
          </div>
          <div>
            <label className="text-xs font-medium">Responsável padrão (opcional)</label>
            <select value={newAssigneeId} onChange={(event) => setNewAssigneeId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary">
              <option value="">Sem responsável fixo</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}
            </select>
          </div>
          <div className="flex gap-2 md:col-span-2 lg:col-span-3">
            <button onClick={createConnection} disabled={busy === "create"} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Salvar e gerar QR Code
            </button>
            <button onClick={() => setAdding(false)} className="rounded-xl border border-border px-4 py-2 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <MessageCircleMore className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhum WhatsApp cadastrado</p>
          <p className="text-sm text-muted-foreground">Adicione o primeiro número para começar.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-2">
            {connections.map((connection) => {
              const connected = connection.status === "connected";
              return (
                <button key={connection.id} onClick={() => setSelectedId(connection.id)} className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                  selected?.id === connection.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/40",
                )}>
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", connected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                    {connected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold">{connection.displayName}{connection.isDefault && <Star className="h-3.5 w-3.5 fill-primary text-primary" />}</span>
                    <span className="block truncate text-xs text-muted-foreground">{connection.phoneNumber || connection.instanceName || "Aguardando conexão"}</span>
                    {connection.sector && <span className="mt-1 block truncate text-[11px] text-primary">{connection.sector}</span>}
                  </span>
                </button>
              );
            })}
          </aside>

          {selected && (
            <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-4">
                <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", selected.status === "connected" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                  {selected.status === "connected" ? <Wifi className="h-7 w-7" /> : <WifiOff className="h-7 w-7" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{selected.status === "connected" ? "WhatsApp conectado" : "WhatsApp desconectado"}</p>
                  <p className="text-sm text-muted-foreground">{selected.phoneNumber || "Leia o QR Code para vincular o número"}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-success" />Cada conversa responde por este mesmo número.</p>
                </div>
                {canManage && <button onClick={() => setQrTarget({ id: selected.id, name: selected.displayName })} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><QrCode className="h-4 w-4" />{selected.status === "connected" ? "Reconectar" : "Conectar"}</button>}
              </div>

              {canManage && (
                <div className="flex flex-wrap gap-2 border-y border-border py-3">
                  {selected.status === "connected" && (
                    <button onClick={desconectar} disabled={busy === "logout"} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60">{busy === "logout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />}Desconectar</button>
                  )}
                  {!selected.isDefault && <button onClick={makeDefault} disabled={busy === "default"} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"><Star className="h-4 w-4" />Tornar padrão</button>}
                  <button onClick={removeConnection} disabled={busy === "remove"} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-60">{busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Remover</button>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2"><label className="text-xs font-medium">Nome no CRM</label><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={!canManage} placeholder="Ex.: Recepção, Comercial, Unidade Centro" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></div>
                <div>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium"><Building2 className="h-3.5 w-3.5 text-primary" />Setor vinculado (opcional)</label>
                  <input list="crm-sectors-edit" value={sector} onChange={(event) => setSector(event.target.value)} disabled={!canManage} placeholder="Sem setor — atendimento geral" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
                  <datalist id="crm-sectors-edit">{sectors.map((item) => <option key={item} value={item} />)}</datalist>
                </div>
                <div>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium"><UserRound className="h-3.5 w-3.5 text-primary" />Responsável padrão (opcional)</label>
                  <select value={defaultAssigneeId} onChange={(event) => setDefaultAssigneeId(event.target.value)} disabled={!canManage} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
                    <option value="">Sem responsável — fila geral</option>
                    {members.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}
                  </select>
                </div>
                <p className="md:col-span-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Novas conversas deste número entram no setor escolhido e, quando houver responsável padrão, já chegam atribuídas a essa pessoa. Ambos os vínculos podem ficar vazios.</p>
              </div>

              <p className="inline-flex items-center gap-1.5 rounded-xl bg-success/10 px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Contatos, conversas e fotos de perfil entram sozinhos assim que o número conecta, e seguem se atualizando.
              </p>

              {/* Endereço, chave e webhook só aparecem se alguém for atrás.
                  No dia a dia ninguém precisa deles, mas sem essa gaveta uma
                  troca de chave ou de servidor não teria conserto pela tela. */}
              {canManage && (
                <div className="rounded-2xl border border-border/70">
                  <button
                    type="button"
                    onClick={() => setMostrarAvancado((valor) => !valor)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground"
                  >
                    <span className="inline-flex items-center gap-2"><Settings2 className="h-4 w-4" />Avançado — servidor, chave e webhook</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", mostrarAvancado && "rotate-180")} />
                  </button>
                  {mostrarAvancado && (
                    <div className="grid gap-3 border-t border-border/70 p-4 md:grid-cols-2">
                      <div><label className="text-xs font-medium">Instância Evolution</label><input value={instance} onChange={(event) => setInstance(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></div>
                      <div><label className="text-xs font-medium">URL do servidor Evolution</label><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="Usa a URL configurada no servidor se ficar vazio" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /></div>
                      <div className="md:col-span-2"><label className="text-xs font-medium">Chave Evolution desta conexão</label><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Deixe vazio para manter a chave atual" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" /><p className="mt-1 text-[11px] text-muted-foreground">A chave fica protegida no servidor e nunca é exibida novamente.</p></div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-medium">Webhook exclusivo desta conta</label>
                        <div className="mt-1 flex gap-2"><input readOnly value={webhookUrl} className="h-10 min-w-0 flex-1 truncate rounded-xl border border-border bg-muted/40 px-3 text-xs" /><button onClick={copyWebhook} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 text-xs">{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar"}</button></div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Registrado na Evolution automaticamente ao parear. Copie só se precisar conferir no servidor.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {canManage && <button onClick={save} disabled={busy === "save"} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar alterações</button>}
            </section>
          )}
        </div>
      )}

      <QrConnectDialog
        open={!!qrTarget}
        connectionId={qrTarget?.id ?? null}
        connectionName={qrTarget?.name ?? "WhatsApp"}
        aguardaNome={!!qrTarget?.novo}
        onClose={() => { setQrTarget(null); invalidate(); }}
      />
    </div>
  );
}
