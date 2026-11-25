-- Sistema da clínica (Santé ou outro) ligado ao CRM.
--
-- crm_clinic_systems: um cadastro por organização. Diz como entrar no
-- sistema (login web com e-mail e senha, ou chave de API), onde buscar o
-- paciente pelo telefone e quais páginas do paciente ler. A senha/chave
-- fica no Vault (clinica_<organização>), nunca nesta tabela.
--
-- crm_clinic_snapshots: o que a edge function crm-clinica leu do sistema
-- para cada contato (paciente e orçamentos, extraídos pelo Claude), com a
-- data da leitura. Só a edge function grava; quem vê o contato lê.

create table if not exists public.crm_clinic_systems (
  organization_id uuid primary key,
  nome text not null default 'Santé',
  tipo text not null default 'login_web' check (tipo in ('login_web', 'api_token')),
  base_url text not null default 'https://app.santeodonto.io',
  login_url text not null default '/users/sign_in',
  campo_usuario text not null default 'user[email]',
  campo_senha text not null default 'user[password]',
  usuario text,
  busca_paciente text not null default '/customers?search={telefone_local}',
  padrao_id text not null default '/customers/(\d+)',
  paginas_paciente text[] not null default array['/customers/{id}/edit', '/customers/{id}/budgets'],
  link_paciente text not null default '/customers/{id}/edit',
  ativo boolean not null default false,
  segredo_salvo boolean not null default false,
  ultimo_teste jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.crm_clinic_systems enable row level security;
drop policy if exists "ver sistema da clinica da organizacao" on public.crm_clinic_systems;
create policy "ver sistema da clinica da organizacao" on public.crm_clinic_systems
  for select to authenticated using (organization_id = public.crm_current_org());
revoke all on public.crm_clinic_systems from anon;
grant select on public.crm_clinic_systems to authenticated;
grant all on public.crm_clinic_systems to service_role;

create table if not exists public.crm_clinic_snapshots (
  contact_id uuid primary key references public.crm_contacts(id) on delete cascade,
  organization_id uuid not null,
  status text not null check (status in ('ok', 'nao_encontrado', 'erro')),
  external_id text,
  external_url text,
  paciente jsonb,
  orcamentos jsonb not null default '[]'::jsonb,
  total_aguardando numeric not null default 0,
  total_aprovado numeric not null default 0,
  vinculado_manual boolean not null default false,
  erro text,
  buscado_em timestamptz not null default now()
);

alter table public.crm_clinic_snapshots enable row level security;
drop policy if exists "ver ficha da clinica de contato visivel" on public.crm_clinic_snapshots;
create policy "ver ficha da clinica de contato visivel" on public.crm_clinic_snapshots
  for select to authenticated
  using (exists (select 1 from public.crm_contacts c where c.id = contact_id));
revoke all on public.crm_clinic_snapshots from anon;
grant select on public.crm_clinic_snapshots to authenticated;
grant all on public.crm_clinic_snapshots to service_role;

-- Senha/chave do sistema da clínica no Vault (só service_role).
create or replace function public.crm_clinica_segredo(_org uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'clinica_' || _org::text limit 1;
$$;

create or replace function public.crm_clinica_salvar_segredo(_org uuid, _valor text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'clinica_' || _org::text;
  if v_id is null then
    perform vault.create_secret(_valor, 'clinica_' || _org::text, 'Senha/chave do sistema da clínica (CRM)');
  else
    perform vault.update_secret(v_id, _valor);
  end if;
end;
$$;

revoke all on function public.crm_clinica_segredo(uuid) from public, anon, authenticated;
revoke all on function public.crm_clinica_salvar_segredo(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_clinica_segredo(uuid) to service_role;
grant execute on function public.crm_clinica_salvar_segredo(uuid, text) to service_role;

-- Lista do "Ativar pacientes" com o que veio do sistema da clínica.
drop function if exists public.crm_ativacao_lista(uuid);

create function public.crm_ativacao_lista(_connection uuid)
returns table (
  conversation_id uuid,
  contact_id uuid,
  nome text,
  telefone text,
  instagram text,
  assignee_id uuid,
  ultima_direcao text,
  ultima_msg_em timestamptz,
  ultimo_texto text,
  ultima_entrada_em timestamptz,
  manutencao boolean,
  resolvida_em timestamptz,
  texto_paciente text,
  audio_sem_resposta boolean,
  lead_etapa text,
  lead_origem text,
  resumo text,
  proximo text,
  etiquetas text[],
  valor text,
  resumo_base_em timestamptz,
  clinica_status text,
  clinica_aguardando numeric,
  clinica_aprovado numeric,
  clinica_url text
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select
    c.id, ct.id, ct.name, ct.phone, ct.instagram_username, c.assignee_id,
    ult.direction, ult.message_at, left(coalesce(ult.content, ''), 280),
    ent.message_at,
    coalesce(sai.content ~* 'manuten', false) and (ent.message_at is null or ent.message_at < sai.message_at),
    c.ativacao_resolvida_em,
    left(coalesce(ent.content, ''), 280),
    exists (
      select 1 from public.messages a
      where a.conversation_id = c.id and a.direction = 'in' and a.type = 'audio'
        and (sai.message_at is null or a.message_at > sai.message_at)
    ),
    ld.status, ld.source,
    r.resumo, r.proximo, r.etiquetas, r.valor, r.base_msg_em,
    s.status, s.total_aguardando, s.total_aprovado, s.external_url
  from public.conversations c
  join public.crm_contacts ct on ct.id = c.contact_id
  cross join lateral (
    select m.direction, m.message_at, m.content from public.messages m
    where m.conversation_id = c.id order by m.message_at desc limit 1
  ) ult
  left join lateral (
    select m.message_at, m.content from public.messages m
    where m.conversation_id = c.id and m.direction = 'in' order by m.message_at desc limit 1
  ) ent on true
  left join lateral (
    select m.message_at, m.content from public.messages m
    where m.conversation_id = c.id and m.direction = 'out' order by m.message_at desc limit 1
  ) sai on true
  left join lateral (
    select l.status, l.source from public.crm_leads l
    where l.contact_id = ct.id and (l.connection_id = c.connection_id or l.connection_id is null)
    order by l.created_at desc limit 1
  ) ld on true
  left join public.crm_ativacao_resumos r on r.conversation_id = c.id
  left join public.crm_clinic_snapshots s on s.contact_id = ct.id
  where c.connection_id = _connection
    and c.last_message_at > now() - interval '120 days'
    and ct.deleted_at is null;
$$;

revoke all on function public.crm_ativacao_lista(uuid) from public, anon;
grant execute on function public.crm_ativacao_lista(uuid) to authenticated, service_role;
