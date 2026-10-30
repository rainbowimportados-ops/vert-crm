import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  BrainCircuit,
  FileSearch,
  Loader2,
  MessageSquareReply,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCrmContext } from "../provider/CrmProvider";

interface AiSettings {
  enabled: boolean;
  auto_reply: boolean;
  auto_classify: boolean;
  auto_ocr: boolean;
  model: string;
  extra_prompt: string;
}

const DEFAULTS: AiSettings = {
  enabled: false,
  auto_reply: false,
  auto_classify: true,
  auto_ocr: true,
  model: "gpt-4o-mini",
  extra_prompt: "",
};

export function AiAgentSettings() {
  const { organizationId, role } = useCrmContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = ["admin", "super_admin", "gestor"].includes(role);
  const { data, isLoading } = useQuery({
    queryKey: ["crm-ai-agent-settings", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data: settings, error } = await supabase
        .from("ai_agent_settings")
        .select(
          "enabled, auto_reply, auto_classify, auto_ocr, model, extra_prompt",
        )
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return settings as AiSettings | null;
    },
  });
  const [form, setForm] = useState<AiSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data)
      setForm({ ...DEFAULTS, ...data, extra_prompt: data.extra_prompt ?? "" });
  }, [data]);

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    const { error } = await supabase
      .from("ai_agent_settings")
      .upsert({
        organization_id: organizationId,
        enabled: form.enabled,
        auto_reply: form.auto_reply,
        auto_classify: form.auto_classify,
        auto_ocr: form.auto_ocr,
        model: form.model,
        extra_prompt: form.extra_prompt.trim() || null,
        updated_at: new Date().toISOString(),
      });
    setSaving(false);
    if (error)
      return toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    toast({
      title: form.enabled
        ? "Assistente de IA atualizado"
        : "IA assistiva pausada",
    });
    await queryClient.invalidateQueries({
      queryKey: ["crm-ai-agent-settings", organizationId],
    });
  };

  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (isLoading)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="p-5 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-primary-dark">
            <Sparkles className="h-3.5 w-3.5" />
            IA do Instituto VERT
          </div>
          <h1 className="text-[30px] font-semibold tracking-[-.03em] text-card-foreground">
            Automação com IA
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure uma IA assistiva moderna para sugerir respostas, resumir
            conversas e classificar oportunidades.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar configuração
          </button>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-background p-5">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white">
                <Bot className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-base">
                  Assistente inteligente
                </strong>
                <small className="block text-xs leading-5 text-muted-foreground">
                  A IA nunca envia sem revisão, exceto se a resposta automática
                  for ativada explicitamente.
                </small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.enabled}
                onClick={() => set("enabled", !form.enabled)}
                disabled={!canManage}
                className={cn(
                  "relative h-7 w-12 flex-none rounded-full transition disabled:opacity-50",
                  form.enabled ? "bg-primary" : "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition",
                    form.enabled ? "left-[22px]" : "left-0.5",
                  )}
                />
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <h2 className="mb-4 text-base font-semibold">
              O que a IA pode fazer
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <Feature
                icon={MessageSquareReply}
                title="Sugerir respostas"
                description="Gera uma resposta contextual dentro do chat."
                active={form.enabled}
              />
              <Feature
                icon={BrainCircuit}
                title="Classificar leads"
                description="Identifica intenção, urgência e objeções."
                active={form.auto_classify}
                onClick={
                  canManage
                    ? () => set("auto_classify", !form.auto_classify)
                    : undefined
                }
              />
              <Feature
                icon={FileSearch}
                title="Ler documentos"
                description="Analisa imagens e comprovantes recebidos."
                active={form.auto_ocr}
                onClick={
                  canManage ? () => set("auto_ocr", !form.auto_ocr) : undefined
                }
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <div className="mb-3">
              <h2 className="text-base font-semibold">
                Orientações da clínica
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Inclua horários, unidades, políticas, tom de voz, restrições e
                informações comerciais. A IA usa este conteúdo como contexto.
              </p>
            </div>
            <textarea
              value={form.extra_prompt}
              onChange={(event) => set("extra_prompt", event.target.value)}
              disabled={!canManage}
              rows={9}
              placeholder="Ex.: Fale de forma acolhedora e objetiva. Nunca invente preços. Atendemos em Franca e Ribeirão Preto…"
              className="w-full resize-y rounded-xl border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
            />
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>
                Estas instruções são adicionadas ao contexto seguro do agente.
              </span>
              <span>{form.extra_prompt.length} caracteres</span>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-white p-5">
            <h2 className="mb-4 text-base font-semibold">
              Modelo e comportamento
            </h2>
            <label className="block text-xs font-medium text-muted-foreground">
              Modelo
              <select
                value={form.model}
                onChange={(event) => set("model", event.target.value)}
                disabled={!canManage}
                className="mt-1.5 h-11 w-full rounded-lg border border-border bg-white px-3 text-sm"
              >
                <option value="gpt-4o-mini">
                  GPT-4o mini — rápido e econômico
                </option>
                <option value="gpt-4o">GPT-4o — maior capacidade</option>
              </select>
            </label>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-accent p-3">
              <input
                type="checkbox"
                checked={form.auto_reply}
                onChange={(event) => set("auto_reply", event.target.checked)}
                disabled={!canManage || !form.enabled}
                className="mt-0.5"
              />
              <span>
                <strong className="block text-sm font-medium">
                  Resposta automática
                </strong>
                <small className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  Quando desligada, a IA apenas sugere e o atendente decide se
                  envia.
                </small>
              </span>
            </label>
          </section>
          <section className="rounded-xl border border-border bg-background p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold">Uso seguro</h2>
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>• A chave do provedor permanece nos segredos do backend.</li>
              <li>
                • O atendente pode pausar a IA em uma conversa específica.
              </li>
              <li>• Sugestões devem ser revisadas antes do envio.</li>
              <li>
                • A IA não deve inventar valores, diagnósticos ou
                disponibilidade.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition",
        active ? "border-border bg-background" : "border-accent bg-white",
        onClick && "hover:border-primary disabled:opacity-60",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          active
            ? "bg-accent text-primary"
            : "bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <strong className="mt-3 block text-sm font-medium">{title}</strong>
      <small className="mt-1 block text-[11px] leading-4 text-muted-foreground">
        {description}
      </small>
    </button>
  );
}
