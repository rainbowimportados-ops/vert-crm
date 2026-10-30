import { ReactNode, useEffect, useState } from "react";
import { Stethoscope, ShieldCheck, LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface AuthFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface AuthLayoutProps {
  /** Título sr-only da página */
  srTitle: string;
  /** Headline do painel da marca (desktop) */
  headline: ReactNode;
  /** Subtítulo do painel da marca */
  sub: string;
  /** Cartões de recursos do painel da marca */
  features: AuthFeature[];
  /** Conteúdo do lado do formulário */
  children: ReactNode;
}

/**
 * Layout compartilhado das telas de entrada (Login, Cadastro, Redefinir senha).
 * Painel esquerdo com a marca + lado direito com o formulário.
 */
export default function AuthLayout({ srTitle, headline, sub, features, children }: AuthLayoutProps) {
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogo = async () => {
      const { data } = await (supabase as any).from("listas").select("valor").eq("tipo", "config_geral");
      if (data) {
        const logoConfig = data.find((r: any) => {
          try {
            return JSON.parse(r.valor).k === "clinic_logo_url";
          } catch {
            return false;
          }
        });
        if (logoConfig) {
          try {
            setClinicLogo(JSON.parse(logoConfig.valor).v);
          } catch {}
        }
      }
    };
    fetchLogo();
  }, []);

  return (
    <main
      className="min-h-[100dvh] flex"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <h1 className="sr-only">{srTitle}</h1>

      {/* ───────── Painel da marca (desktop) ───────── */}
      <aside className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-gradient-primary flex-col justify-between p-12 xl:p-16">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-[-8rem] right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-black/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          {clinicLogo ? (
            <img src={clinicLogo} alt="Logo da clínica" className="h-14 w-auto object-contain drop-shadow-md" />
          ) : (
            <>
              <div className="bg-white/15 backdrop-blur-sm border border-white/20 p-2.5 rounded-2xl shadow-lg">
                <Stethoscope className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-extrabold text-2xl text-white leading-none tracking-tight">VERT</p>
                <p className="text-[11px] text-white/70 tracking-[0.25em] uppercase">Gestão Odontológica</p>
              </div>
            </>
          )}
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl xl:text-[2.75rem] font-extrabold text-white leading-[1.15] tracking-tight">
            {headline}
          </h2>
          <p className="mt-4 text-white/80 text-base xl:text-lg font-light">{sub}</p>

          <ul className="mt-10 space-y-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <li
                key={title}
                className="flex items-start gap-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-3.5 transition-colors hover:bg-white/15"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 border border-white/20">
                  <Icon className="h-[18px] w-[18px] text-white" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-[13px] text-white/70 leading-snug">{desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-white/70 text-xs">
          <ShieldCheck className="h-4 w-4" />
          <span>Dados criptografados · Acesso protegido por bloqueio inteligente · LGPD</span>
        </div>
      </aside>

      {/* ───────── Lado do formulário ───────── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:px-10 bg-background relative">
        <div className="w-full max-w-[400px] rise">
          {/* Logo mobile */}
          <div className="flex flex-col items-center gap-3 mb-8 lg:hidden">
            {clinicLogo ? (
              <img src={clinicLogo} alt="Logo da clínica" className="h-14 w-auto object-contain" />
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="bg-primary p-2 rounded-xl shadow-sm">
                  <Stethoscope className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-extrabold text-xl text-foreground leading-none">VERT</span>
                  <p className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase">Gestão Odontológica</p>
                </div>
              </div>
            )}
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}
