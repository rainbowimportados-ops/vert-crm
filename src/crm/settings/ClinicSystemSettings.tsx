import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, Save, Stethoscope, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PRESET_SANTE, useAcoesClinica, useSistemaClinica, type SistemaClinica } from "../services/clinica";

const campo =
  "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";
const botao =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium disabled:opacity-50";

type Form = Omit<SistemaClinica, "segredo_salvo" | "ultimo_teste">;

const VAZIO: Form = {
  nome: "",
  tipo: "login_web",
  base_url: "",
  login_url: "/login",
  campo_usuario: "email",
  campo_senha: "password",
  usuario: "",
  busca_paciente: "/pacientes?busca={telefone_local}",
  padrao_id: "/pacientes/(\\d+)",
  paginas_paciente: ["/pacientes/{id}"],
  link_paciente: "/pacientes/{id}",
  ativo: false,
};

/**
 * Configurações → Sistema da clínica. O Santé vem pronto (só login e senha);
 * outro sistema web se cadastra preenchendo os endereços. A senha vai direto
 * para o cofre do Supabase pela edge function e nunca volta para a tela.
 */
export function ClinicSystemSettings() {
  const { data: sistema, isLoading } = useSistemaClinica();
  const acoes = useAcoesClinica();
  const { toast } = useToast();
  const [form, setForm] = useState<Form>({ ...PRESET_SANTE, usuario: "", ativo: true });
  const [senha, setSenha] = useState("");
  const [avancado, setAvancado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [telefoneTeste, setTelefoneTeste] = useState("");
  const [passos, setPassos] = useState<SistemaClinica["ultimo_teste"]>(null);

  useEffect(() => {
    if (!sistema) return;
    setForm({
      nome: sistema.nome, tipo: sistema.tipo, base_url: sistema.base_url, login_url: sistema.login_url,
      campo_usuario: sistema.campo_usuario, campo_senha: sistema.campo_senha, usuario: sistema.usuario ?? "",
      busca_paciente: sistema.busca_paciente, padrao_id: sistema.padrao_id,
      paginas_paciente: sistema.paginas_paciente ?? [], link_paciente: sistema.link_paciente, ativo: sistema.ativo,
    });
    setPassos(sistema.ultimo_teste);
  }, [sistema]);

  const eSante = form.base_url.includes("santeodonto");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form.nome.trim() || !form.base_url.trim()) {
      toast({ title: "Falta o nome e o endereço do sistema", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      await acoes.salvar(form, senha || undefined);
      toast({ title: `${form.nome} salvo`, description: senha ? "A senha foi para o cofre." : undefined });
      setSenha("");
    } catch (e) {
      toast({ title: "Não salvou", description: e instanceof Error ? e.message : "Tente de novo.", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    try {
      const r = await acoes.testar(telefoneTeste.trim() || undefined);
      setPassos({ em: new Date().toISOString(), passos: r.passos });
    } catch (e) {
      toast({ title: "O teste não rodou", description: e instanceof Error ? e.message : "Tente de novo.", variant: "destructive" });
    } finally {
      setTestando(false);
    }
  };

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="max-w-3xl p-5 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[30px] font-semibold tracking-[-.03em] text-card-foreground">Sistema da clínica</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O Claude entra no sistema da clínica, acha o paciente pelo telefone e lê os orçamentos para o copiloto de vendas.
          </p>
        </div>
        <button onClick={() => void salvar()} disabled={salvando} className={cn(botao, "bg-primary text-white")}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </button>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-semibold">Qual sistema?</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sistema">
          <button
            role="radio"
            aria-checked={eSante}
            onClick={() => setForm((f) => ({ ...f, ...PRESET_SANTE }))}
            className={cn("rounded-full border px-4 py-1.5 text-sm", eSante ? "border-primary bg-primary/10 text-primary" : "border-border")}
          >
            Santé Odonto
          </button>
          <button
            role="radio"
            aria-checked={!eSante}
            onClick={() => {
              setForm((f) => ({ ...VAZIO, usuario: f.usuario, ativo: f.ativo }));
              setAvancado(true);
            }}
            className={cn("rounded-full border px-4 py-1.5 text-sm", !eSante ? "border-primary bg-primary/10 text-primary" : "border-border")}
          >
            Outro sistema
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Nome que aparece no CRM</span>
            <input className={campo} value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Clinicorp" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Endereço do sistema</span>
            <input className={campo} value={form.base_url} onChange={(e) => set("base_url", e.target.value)} placeholder="https://app.sistema.com.br" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Usuário (e-mail de login)</span>
            <input className={campo} value={form.usuario ?? ""} onChange={(e) => set("usuario", e.target.value)} autoComplete="off" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">
              Senha {sistema?.segredo_salvo && <span className="text-success">· salva no cofre</span>}
            </span>
            <input
              className={campo}
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={sistema?.segredo_salvo ? "deixe em branco para manter" : "senha do sistema"}
              autoComplete="new-password"
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} className="h-4 w-4 accent-primary" />
          Ligado: buscar orçamentos dos pacientes no {form.nome || "sistema"}
        </label>

        <button
          onClick={() => setAvancado((v) => !v)}
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", avancado && "rotate-180")} />
          Endereços do sistema {eSante ? "(já preenchidos para o Santé)" : ""}
        </button>

        {avancado && (
          <div className="mt-3 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
            {([
              ["login_url", "Página de login"],
              ["campo_usuario", "Campo do usuário no formulário"],
              ["campo_senha", "Campo da senha no formulário"],
              ["busca_paciente", "Busca de paciente ({telefone_local}, {telefone_formatado}, {telefone_sem9})"],
              ["padrao_id", "Como achar o id do paciente nos links (regex)"],
              ["link_paciente", "Link para abrir o paciente ({id})"],
            ] as const).map(([k, rotulo]) => (
              <label key={k} className="text-xs">
                <span className="mb-1 block text-muted-foreground">{rotulo}</span>
                <input className={cn(campo, "h-9 font-mono text-xs")} value={form[k]} onChange={(e) => set(k, e.target.value)} />
              </label>
            ))}
            <label className="text-xs sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Páginas que o Claude lê do paciente (uma por linha, com {"{id}"})</span>
              <textarea
                className={cn(campo, "h-20 py-2 font-mono text-xs")}
                value={form.paginas_paciente.join("\n")}
                onChange={(e) => set("paginas_paciente", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))}
              />
            </label>
          </div>
        )}
      </section>

      <section className="mt-5 rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold">Testar a conexão</p>
        <p className="mt-1 text-xs text-muted-foreground">Salve antes. Com um telefone, o teste também procura o paciente.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className={cn(campo, "max-w-xs")}
            value={telefoneTeste}
            onChange={(e) => setTelefoneTeste(e.target.value)}
            placeholder="Telefone de um paciente (opcional)"
            aria-label="Telefone para o teste"
          />
          <button
            onClick={() => void testar()}
            disabled={testando || !sistema}
            className={cn(botao, "border border-border bg-white hover:border-primary")}
          >
            {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />} Testar
          </button>
        </div>
        {passos && (
          <ul className="mt-4 space-y-1.5" aria-label="Resultado do teste">
            {passos.passos.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {p.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <span>
                  {p.passo}
                  {p.detalhe && <span className="block text-xs text-muted-foreground">{p.detalhe}</span>}
                </span>
              </li>
            ))}
            <li className="pt-1 text-[11px] text-muted-foreground">
              Testado em {new Date(passos.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}
