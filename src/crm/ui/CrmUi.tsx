import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Filter, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function CrmPageHeader({ title, subtitle, search, onSearch, placeholder = "Buscar...", onFilter, primaryLabel, onPrimary, children }: {
  title: string; subtitle?: string; search?: string; onSearch?: (value: string) => void; placeholder?: string;
  onFilter?: () => void; primaryLabel?: string; onPrimary?: () => void; children?: ReactNode;
}) {
  return <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
    <div><h1 className="text-[30px] font-semibold leading-tight tracking-[-.03em] text-card-foreground">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div>
    <div className="flex flex-wrap items-center gap-2.5">
      {search !== undefined && onSearch && <label className="relative block min-w-[230px] flex-1 xl:w-[270px] xl:flex-none"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>}
      {onFilter && <button onClick={onFilter} className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-medium text-card-foreground hover:bg-background"><Filter className="h-4 w-4" />Filtros</button>}
      {children}
      {primaryLabel && <button onClick={onPrimary} className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary px-4 text-sm font-medium text-white shadow-sm hover:opacity-95"><Plus className="h-4 w-4" />{primaryLabel}</button>}
    </div>
  </div>;
}

export function CrmStatCard({ icon: Icon, label, value, helper, tone = "brown" }: { icon: LucideIcon; label: string; value: ReactNode; helper?: string; tone?: "brown" | "green" | "blue" | "orange" }) {
  const tones = { brown: "bg-accent text-primary", green: "bg-success/10 text-success", blue: "bg-muted text-primary", orange: "bg-accent text-warning" };
  return <div className="flex min-h-[110px] items-center gap-4 rounded-xl border border-border bg-white px-5 py-4 shadow-elevation-md">
    <span className={cn("flex h-14 w-14 flex-none items-center justify-center rounded-full", tones[tone])}><Icon className="h-7 w-7 stroke-[1.7]" /></span>
    <span className="min-w-0"><span className="block text-sm text-sidebar-foreground">{label}</span><strong className="mt-0.5 block truncate text-[28px] font-semibold leading-none tracking-[-.03em] text-card-foreground">{value}</strong>{helper && <small className="mt-2 block truncate text-xs text-muted-foreground">{helper}</small>}</span>
  </div>;
}

export function CrmStatus({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "blue" | "amber" | "red" }) {
  const tones = { neutral: "bg-accent text-accent-foreground", green: "bg-success/10 text-success", blue: "bg-muted text-primary", amber: "bg-accent text-primary", red: "bg-accent text-destructive" };
  return <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium", tones[tone])}>{children}</span>;
}

export function CrmTableFooter({ text }: { text: string }) {
  return <div className="flex min-h-12 items-center justify-between border-t border-accent px-5 text-xs text-muted-foreground"><span>{text}</span><div className="flex gap-1"><button disabled title="Página anterior" className="h-8 min-w-8 cursor-not-allowed rounded-md border border-border opacity-40">‹</button><button aria-current="page" className="h-8 min-w-8 rounded-md bg-primary text-white">1</button><button disabled title="Próxima página" className="h-8 min-w-8 cursor-not-allowed rounded-md border border-border opacity-40">›</button></div></div>;
}

export function CrmEmpty({ title, description }: { title: string; description?: string }) {
  return <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center"><strong className="text-sm text-card-foreground">{title}</strong>{description && <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>}</div>;
}
