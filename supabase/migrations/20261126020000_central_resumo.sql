-- Central Organizadora, etapa 3: resumo e plano do dia (Claude) e ideias de
-- conteúdo tiradas das dúvidas dos pacientes. Um por clínica por dia; é gerado
-- na primeira abertura do CRM no dia e refeito no botão Atualizar.
create table if not exists public.crm_central_resumos (
  organization_id uuid not null,
  dia date not null,
  foco text not null,
  plano jsonb not null default '[]'::jsonb,
  ideias jsonb not null default '[]'::jsonb,
  gerado_em timestamptz not null default now(),
  primary key (organization_id, dia)
);

alter table public.crm_central_resumos enable row level security;
drop policy if exists "ver resumo do dia da clinica" on public.crm_central_resumos;
create policy "ver resumo do dia da clinica" on public.crm_central_resumos
  for select using (organization_id = public.crm_current_org());
-- marcar item do plano como feito na tela
drop policy if exists "marcar plano do dia da clinica" on public.crm_central_resumos;
create policy "marcar plano do dia da clinica" on public.crm_central_resumos
  for update using (organization_id = public.crm_current_org())
  with check (organization_id = public.crm_current_org());
grant select, update on public.crm_central_resumos to authenticated;
