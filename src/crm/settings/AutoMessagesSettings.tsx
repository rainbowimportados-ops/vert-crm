import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HandMetal, MoonStar, Save, Loader2 } from "lucide-react";
import { useCrmContext } from "../provider/CrmProvider";

interface Cfg {
  greeting_enabled: boolean;
  greeting_text: string;
  away_enabled: boolean;
  away_text: string;
  business_hours: Record<string, [string, string] | null>;
}

const DIAS = [
  { k: "1", label: "Segunda" }, { k: "2", label: "Terça" }, { k: "3", label: "Quarta" },
  { k: "4", label: "Quinta" }, { k: "5", label: "Sexta" }, { k: "6", label: "Sábado" }, { k: "0", label: "Domingo" },
];

interface Props {
  /** Renderiza só um dos blocos. Sem a prop, mostra os dois (comportamento antigo). */
  only?: "greeting" | "away";
}

const TITULOS = {
  greeting: {
    title: "Mensagens de Saudação",
    subtitle: "Configure mensagens automáticas para acolher seus contatos com atenção e profissionalismo.",
  },
  away: {
    title: "Mensagem de Ausência",
    subtitle: "Enviada fora do horário de atendimento — no máximo uma a cada 12 horas por conversa.",
  },
  both: {
    title: "Mensagens automáticas",
    subtitle:
      "Saudação e ausência funcionam sem IA. Quando o Agente de IA está respondendo, ele assume e estas não disparam.",
  },
} as const;

/** Saudação para contato novo + mensagem de ausência fora do horário — no padrão da referência. */
export function AutoMessagesSettings({ only }: Props = {}) {
  const { organizationId, role } = useCrmContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = ["admin", "super_admin", "gestor"].includes(role);

  const { data } = useQuery({
    queryKey: ["crm-auto-messages", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<Cfg | null> => {
      const { data } = await supabase.from("crm_auto_messages" as never)
        .select("greeting_enabled, greeting_text, away_enabled, away_text, business_hours")
        .eq("organization_id", organizationId).maybeSingle();
      return (data as unknown as Cfg) ?? null;
    },
  });

  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setCfg(data); }, [data]);
  if (!cfg) {
    return (
      <div className="px-5 py-5 text-sm text-muted-foreground md:px-8">
        Carregando as mensagens automáticas…
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("crm_auto_messages" as never).upsert({
      organization_id: organizationId, ...cfg, updated_at: new Date().toISOString(),
    } as never);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Mensagens automáticas salvas" });
    qc.invalidateQueries({ queryKey: ["crm-auto-messages", organizationId] });
  };

  const setHour = (dia: string, idx: 0 | 1, value: string) => {
    setCfg((c) => {
      if (!c) return c;
      const cur = c.business_hours[dia] ?? ["08:00", "18:00"];
      const next: [string, string] = [...cur] as [string, string];
      next[idx] = value;
      return { ...c, business_hours: { ...c.business_hours, [dia]: next } };
    });
  };
  const toggleDia = (dia: string) => {
    setCfg((c) => c && ({
      ...c,
      business_hours: { ...c.business_hours, [dia]: c.business_hours[dia] ? null : ["08:00", "18:00"] },
    }));
  };

  const copy = TITULOS[only ?? "both"];
  const showGreeting = only !== "away";
  const showAway = only !== "greeting";

  return (
    <div className="w-full max-w-4xl space-y-4 px-5 py-5 md:px-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>

      {/* Saudação */}
      {showGreeting && (
      <div className="card-premium space-y-2.5 p-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <HandMetal className="h-4 w-4 text-primary" /> Saudação para novos contatos
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={cfg.greeting_enabled} onChange={(e) => setCfg({ ...cfg, greeting_enabled: e.target.checked })} disabled={!canManage} />
            {cfg.greeting_enabled ? "Ativada" : "Desativada"}
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">Enviada uma única vez, na primeira mensagem de quem nunca foi respondido — só dentro do horário de atendimento.</p>
        <textarea
          value={cfg.greeting_text}
          onChange={(e) => setCfg({ ...cfg, greeting_text: e.target.value })}
          disabled={!canManage}
          rows={3}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Variáveis disponíveis:</span>
          <code className="rounded-lg border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-foreground">{"{nome_cliente}"}</code>
          <code className="rounded-lg border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-foreground">{"{horario}"}</code>
        </div>
      </div>
      )}

      {/* Ausência */}
      {showAway && (
      <div className="card-premium space-y-2.5 p-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <MoonStar className="h-4 w-4 text-primary" /> Mensagem de ausência
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={cfg.away_enabled} onChange={(e) => setCfg({ ...cfg, away_enabled: e.target.checked })} disabled={!canManage} />
            {cfg.away_enabled ? "Ativada" : "Desativada"}
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">Enviada fora do horário de atendimento — no máximo uma a cada 12 horas por conversa.</p>
        <textarea
          value={cfg.away_text}
          onChange={(e) => setCfg({ ...cfg, away_text: e.target.value })}
          disabled={!canManage}
          rows={3}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        />

        <div className="pt-1">
          <p className="mb-2 text-sm font-semibold tracking-tight text-foreground">Horário de funcionamento</p>
          <div className="space-y-1.5">
            {DIAS.map((d) => {
              const r = cfg.business_hours[d.k];
              return (
                <div key={d.k} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <label className="flex w-24 flex-shrink-0 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={!!r} onChange={() => toggleDia(d.k)} disabled={!canManage} />
                    <span className={r ? "font-medium text-foreground" : "text-muted-foreground"}>{d.label}</span>
                  </label>
                  {r ? (
                    <>
                      <input type="time" value={r[0]} onChange={(e) => setHour(d.k, 0, e.target.value)} disabled={!canManage}
                        className="rounded-lg border border-border bg-card px-2 py-1 text-xs outline-none focus:border-primary" />
                      <span className="text-xs text-muted-foreground">até</span>
                      <input type="time" value={r[1]} onChange={(e) => setHour(d.k, 1, e.target.value)} disabled={!canManage}
                        className="rounded-lg border border-border bg-card px-2 py-1 text-xs outline-none focus:border-primary" />
                    </>
                  ) : (
                    <span className="rounded-lg bg-muted px-2 py-0.5 text-xs text-muted-foreground">Fechado</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {canManage && (
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </button>
      )}
    </div>
  );
}
