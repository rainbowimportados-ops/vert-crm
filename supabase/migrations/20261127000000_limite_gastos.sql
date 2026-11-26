-- Limitador de gastos com IA (Claude, transcrição e assistentes).
-- Antes de cada chamada paga, a edge function RESERVA o custo estimado; se a
-- soma do dia ou do mês passar do limite, a chamada não acontece. Depois da
-- resposta, confirma o custo real (tokens usados). Dia e mês no horário de
-- São Paulo. Reservas que não foram confirmadas em 15 min deixam de contar.

create table if not exists public.crm_limites_gasto (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  limite_dia_usd numeric(10,2) not null default 5 check (limite_dia_usd >= 0),
  limite_mes_usd numeric(10,2) not null default 60 check (limite_mes_usd >= 0),
  alerta_pct int not null default 80 check (alerta_pct between 1 and 100),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table if not exists public.crm_gastos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  servico text not null,          -- claude, transcricao, assistente
  funcao text not null,           -- edge function e ação (ex.: crm-ativacao:escrever)
  modelo text,
  tokens_in int,
  tokens_out int,
  custo_usd numeric(12,6) not null default 0,
  status text not null default 'reservado' check (status in ('reservado', 'confirmado', 'cancelado', 'bloqueado')),
  criado_em timestamptz not null default now()
);
create index if not exists crm_gastos_org_data on public.crm_gastos (organization_id, criado_em desc);

alter table public.crm_limites_gasto enable row level security;
alter table public.crm_gastos enable row level security;

drop policy if exists "ver limites da organizacao" on public.crm_limites_gasto;
create policy "ver limites da organizacao" on public.crm_limites_gasto
  for select using (organization_id = public.crm_current_org());
drop policy if exists "ver gastos da organizacao" on public.crm_gastos;
create policy "ver gastos da organizacao" on public.crm_gastos
  for select using (organization_id = public.crm_current_org());

revoke all on public.crm_limites_gasto, public.crm_gastos from anon;
grant select on public.crm_limites_gasto, public.crm_gastos to authenticated;
grant all on public.crm_limites_gasto, public.crm_gastos to service_role;

-- Soma do que conta no período: confirmados + reservas recentes.
create or replace function public.crm_gasto_soma(_org uuid, _desde timestamptz)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(custo_usd), 0)
  from public.crm_gastos
  where organization_id = _org
    and criado_em >= _desde
    and (status = 'confirmado' or (status = 'reservado' and criado_em > now() - interval '15 minutes'));
$$;

create or replace function public.crm_gasto_reservar(_org uuid, _servico text, _funcao text, _estimado numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  lim public.crm_limites_gasto;
  inicio_dia timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  dia numeric;
  mes numeric;
  novo uuid;
begin
  -- trava por organização: duas reservas ao mesmo tempo não passam juntas do limite
  perform pg_advisory_xact_lock(hashtext('crm_gasto:' || _org::text));
  insert into public.crm_limites_gasto (organization_id) values (_org) on conflict do nothing;
  select * into lim from public.crm_limites_gasto where organization_id = _org;
  dia := public.crm_gasto_soma(_org, inicio_dia);
  mes := public.crm_gasto_soma(_org, inicio_mes);
  if lim.ativo and (dia + _estimado > lim.limite_dia_usd or mes + _estimado > lim.limite_mes_usd) then
    -- registra a tentativa barrada (custo zero) para o painel mostrar
    insert into public.crm_gastos (organization_id, servico, funcao, custo_usd, status)
    values (_org, _servico, _funcao, 0, 'bloqueado');
    if dia + _estimado > lim.limite_dia_usd then
      return jsonb_build_object('ok', false, 'motivo', 'dia', 'usado', round(dia, 2), 'limite', lim.limite_dia_usd);
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'mes', 'usado', round(mes, 2), 'limite', lim.limite_mes_usd);
  end if;
  insert into public.crm_gastos (organization_id, servico, funcao, custo_usd)
  values (_org, _servico, _funcao, _estimado) returning id into novo;
  return jsonb_build_object('ok', true, 'id', novo);
end;
$$;

create or replace function public.crm_gasto_confirmar(_id uuid, _custo numeric, _modelo text, _tokens_in int, _tokens_out int)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.crm_gastos
  set custo_usd = greatest(_custo, 0), modelo = _modelo, tokens_in = _tokens_in, tokens_out = _tokens_out, status = 'confirmado'
  where id = _id;
$$;

create or replace function public.crm_gasto_cancelar(_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.crm_gastos set status = 'cancelado', custo_usd = 0 where id = _id and status = 'reservado';
$$;

revoke all on function public.crm_gasto_soma(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.crm_gasto_reservar(uuid, text, text, numeric) from public, anon, authenticated;
revoke all on function public.crm_gasto_confirmar(uuid, numeric, text, int, int) from public, anon, authenticated;
revoke all on function public.crm_gasto_cancelar(uuid) from public, anon, authenticated;
grant execute on function public.crm_gasto_soma(uuid, timestamptz) to service_role;
grant execute on function public.crm_gasto_reservar(uuid, text, text, numeric) to service_role;
grant execute on function public.crm_gasto_confirmar(uuid, numeric, text, int, int) to service_role;
grant execute on function public.crm_gasto_cancelar(uuid) to service_role;

-- Painel: quanto foi gasto hoje e no mês, por serviço, e os limites.
create or replace function public.crm_gastos_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  org uuid := public.crm_current_org();
  inicio_dia timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  lim public.crm_limites_gasto;
begin
  if org is null then return null; end if;
  select * into lim from public.crm_limites_gasto where organization_id = org;
  return jsonb_build_object(
    'limite_dia_usd', coalesce(lim.limite_dia_usd, 5),
    'limite_mes_usd', coalesce(lim.limite_mes_usd, 60),
    'alerta_pct', coalesce(lim.alerta_pct, 80),
    'ativo', coalesce(lim.ativo, true),
    'hoje_usd', round(public.crm_gasto_soma(org, inicio_dia), 4),
    'mes_usd', round(public.crm_gasto_soma(org, inicio_mes), 4),
    'por_servico', coalesce((
      select jsonb_object_agg(servico, total) from (
        select servico, round(sum(custo_usd), 4) total from public.crm_gastos
        where organization_id = org and criado_em >= inicio_mes and status = 'confirmado'
        group by servico
      ) s
    ), '{}'::jsonb),
    'chamadas_mes', (select count(*) from public.crm_gastos where organization_id = org and criado_em >= inicio_mes and status = 'confirmado'),
    'bloqueios_hoje', (select count(*) from public.crm_gastos where organization_id = org and criado_em >= inicio_dia and status = 'bloqueado')
  );
end;
$$;
revoke all on function public.crm_gastos_resumo() from public, anon;
grant execute on function public.crm_gastos_resumo() to authenticated, service_role;

-- Só administrador muda os limites.
create or replace function public.crm_gasto_definir_limites(_dia numeric, _mes numeric, _alerta int, _ativo boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  org uuid := public.crm_current_org();
begin
  if org is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Só administradores podem mudar o limite de gastos.';
  end if;
  if _dia < 0 or _mes < 0 or _alerta not between 1 and 100 then
    raise exception 'Valores inválidos.';
  end if;
  insert into public.crm_limites_gasto (organization_id, limite_dia_usd, limite_mes_usd, alerta_pct, ativo, atualizado_em, atualizado_por)
  values (org, _dia, _mes, _alerta, _ativo, now(), auth.uid())
  on conflict (organization_id) do update
    set limite_dia_usd = excluded.limite_dia_usd, limite_mes_usd = excluded.limite_mes_usd,
        alerta_pct = excluded.alerta_pct, ativo = excluded.ativo,
        atualizado_em = now(), atualizado_por = auth.uid();
end;
$$;
revoke all on function public.crm_gasto_definir_limites(numeric, numeric, int, boolean) from public, anon;
grant execute on function public.crm_gasto_definir_limites(numeric, numeric, int, boolean) to authenticated;
