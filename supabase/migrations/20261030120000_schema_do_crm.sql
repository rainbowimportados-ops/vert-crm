-- Schema do VERT CRM -- banco proprio, so com o CRM.
--
-- De onde vem
-- -----------
-- Recorte do banco do VertControl: o baseline
-- (vertcontrol/supabase/migrations/20260901180000_baseline_do_schema.sql) mais os
-- gatilhos de auth.users e os buckets do CRM de 20260901190000. Ficou so o que o
-- app (src/) e as edge functions do CRM usam, e o que isso puxa (FK, trigger,
-- policy, funcao chamada por policy).
--
-- O que NAO tem aqui, de proposito: nenhuma tabela clinica -- pacientes, agenda,
-- orcamentos, procedimentos, profissionais, salas, financeiro, estoque, TPD,
-- odontograma, triagem. Pacientes e agenda vao vir de outro banco depois.
-- Coluna do CRM que apontava para tabela clinica (crm_contacts.patient_id,
-- crm_leads.patient_id/budget_id/interest_procedure_id,
-- conversations.interest_procedure_id) continua existindo como uuid simples,
-- sem FK -- secao 5.
--
-- Conferido contra producao em 30/10/2026 (somente leitura)
-- ----------------------------------------------------------
-- * As 62 funcoes de public/private/private_security: md5 de pg_get_functiondef
--   identico ao baseline. Nenhuma funcao do CRM mudou depois de 01/09.
-- * Das 37 tabelas daqui: colunas, policies, triggers, indices e constraints
--   identicos ao baseline, exceto crm_leads, que ganhou 5 colunas (secao 3).
-- * O baseline nao tinha GRANTs. Producao tem: schemas private/private_security
--   so para authenticated/service_role, e varias funcoes SECURITY DEFINER
--   (crm_ingest_message, crm_import_*, crm_whatsapp_keepalive...) fechadas para
--   anon/authenticated. Sem isso, num projeto novo qualquer um com a chave anon
--   chamaria crm_ingest_message via /rpc. Replicado na secao 11.
-- * Producao publica crm_contacts, conversations e messages no Realtime
--   (o useCrmRealtime do app depende disso). Secao 14.
-- * Producao agenda crm_whatsapp_keepalive() a cada 5 min no pg_cron. Secao 15
--   (deixado comentado, com instrucoes).
--
-- Rodar
-- -----
-- Num projeto Supabase novo e vazio. E idempotente onde foi barato: create ...
-- if not exists, constraint em bloco que ignora "ja existe", drop-then-create em
-- trigger e policy. Validado num Postgres 16 local com
-- supabase/tests/stubs_supabase_local.sql e supabase/tests/smoke_crm.sql.

-- Funcao LANGUAGE sql tem o corpo validado no CREATE; algumas chamam outras que
-- vem depois na ordem alfabetica (crm_can_access -> has_role). Mesma saida do
-- pg_dump e do baseline: desligar a validacao so nesta sessao.
set check_function_bodies = off;
set search_path = public;

-- 1. extensoes
--
-- pgcrypto e uuid-ossp ja vem num projeto Supabase novo; o "if not exists" so
-- garante. gen_random_uuid() e nativa do Postgres 13+, nao depende delas.
-- pg_trgm e unaccent ficaram de fora: no banco antigo so serviam a tabelas e
-- funcoes da clinica (busca de pacientes, normalizacao de cidade).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- pg_net e pg_cron so servem ao keepalive do WhatsApp (secao 13). Sao opcionais:
-- se o servidor nao tiver a extensao disponivel, a migration segue sem ela.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema public';
  else
    raise notice 'pg_net indisponivel neste servidor: keepalive do WhatsApp fica desligado';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  else
    raise notice 'pg_cron indisponivel neste servidor: agendamento do keepalive fica manual';
  end if;
end $$;


-- 2. enums
--
-- So app_role. Os outros cinco enums do banco antigo (appointment_status,
-- budget_status, evaluation_status, patient_status, tpd_status) sao da clinica.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'app_role') then
    create type public.app_role as enum ('admin', 'financeiro', 'recepcao', 'doutor', 'super_admin', 'atendente', 'gestor');
  end if;
end $$;

-- 2.1 funcoes exigidas por coluna gerada
--
-- Esta funcao precisa existir ANTES das tabelas, e nao junto com as outras na
-- secao 7: crm_contacts.phone_normalized e uma coluna GENERATED ALWAYS AS
-- (crm_normalize_phone(phone)) STORED, e o Postgres resolve a funcao na hora de
-- criar a tabela. Foi o que derrubou a primeira tentativa deste baseline:
--
--   ERROR: function crm_normalize_phone(text) does not exist (SQLSTATE 42883)
--
-- E o unico caso no banco -- conferido cruzando toda coluna gerada, todo default
-- e todo check com as funcoes proprias. Ela e IMMUTABLE e so mexe em texto, sem
-- referenciar tabela, entao subir e seguro. Continua repetida na secao 7 de
-- proposito: CREATE OR REPLACE e idempotente, e assim a secao 7 segue sendo a
-- lista completa das funcoes.

CREATE OR REPLACE FUNCTION public.crm_normalize_phone(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when length(regexp_replace(coalesce(p,''),'\D','','g')) >= 12
         and left(regexp_replace(coalesce(p,''),'\D','','g'),2) = '55'
    then substr(regexp_replace(coalesce(p,''),'\D','','g'),3)
    else regexp_replace(coalesce(p,''),'\D','','g')
  end
$function$;


-- 2.2 schemas auxiliares da aplicacao
--
-- private e private_security guardam funcoes chamadas pelas policies do schema
-- public. Sem elas, a terceira tentativa deste baseline parou em:
--   ERROR: schema "private" does not exist (SQLSTATE 3F000)
--   create policy campaigns_delete ... private.crm_can_access_connection(...)
--
-- Nao tem tabela nenhuma: sao 8 funcoes de apoio a autorizacao. O baseline
-- cobria so o schema public, e este era o buraco.

create schema if not exists private;
create schema if not exists private_security;

CREATE OR REPLACE FUNCTION private.crm_can_access_connection(_connection uuid, _write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select exists (
    select 1
    from public.whatsapp_connections wc
    where wc.id = _connection
      and wc.organization_id = public.crm_current_org()
      and wc.is_active
      and (
        private.crm_user_is_manager()
        or exists (
          select 1
          from public.crm_connection_members cm
          join public.crm_members m
            on m.organization_id = cm.organization_id
           and m.user_id = cm.user_id
           and m.active
          where cm.connection_id = wc.id
            and cm.organization_id = wc.organization_id
            and cm.user_id = auth.uid()
            and cm.active
            and (not _write or cm.access_level in ('agent', 'manager'))
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION private.crm_can_access_contact(_contact uuid, _write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select exists (
    select 1 from public.conversations c
    where c.contact_id = _contact
      and c.organization_id = public.crm_current_org()
      and private.crm_can_access_connection(c.connection_id, _write)
  );
$function$
;

CREATE OR REPLACE FUNCTION private.crm_can_access_conversation(_conversation uuid, _write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select exists (
    select 1 from public.conversations c
    where c.id = _conversation
      and c.organization_id = public.crm_current_org()
      and private.crm_can_access_connection(c.connection_id, _write)
  );
$function$
;

CREATE OR REPLACE FUNCTION private.crm_has_any_connection_access(_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select exists (
    select 1 from public.whatsapp_connections wc
    where wc.organization_id = public.crm_current_org()
      and private.crm_can_access_connection(wc.id, _write)
  );
$function$
;

CREATE OR REPLACE FUNCTION private.crm_user_is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'gestor'::public.app_role);
$function$
;

CREATE OR REPLACE FUNCTION private_security.assign_user_role(_user_id uuid, _role public.app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only allow if caller is admin
  -- We use the private implementation to check role to avoid recursion if public is invoker
  IF NOT private_security.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id) DO UPDATE SET role = _role;
END;
$function$
;

CREATE OR REPLACE FUNCTION private_security.get_my_role()
 RETURNS public.app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION private_security.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
;

-- O baseline nao trazia os GRANTs destes schemas, e sem eles toda policy que
-- chama private.* falha para o usuario logado com "permission denied for schema
-- private". Copiado do banco de producao (nspacl em 30/10/2026).
revoke all on schema private, private_security from public;
grant usage on schema private, private_security to authenticated, service_role;


-- 3. tabelas
--
-- 37 tabelas: o nucleo do CRM, a plataforma (organizacao, usuarios, papeis,
-- modulos) e o que as edge functions do CRM leem e escrevem. Nenhuma tabela
-- clinica (pacientes, agenda, orcamentos, procedimentos, financeiro, estoque...).

create table if not exists public.organizations (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text,
  owner_id uuid,
  status text default 'trial'::text not null,
  plan text default 'completo'::text not null,
  trial_ends_at timestamp with time zone default (now() + '14 days'::interval) not null,
  phone text,
  document text,
  admin_notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  show_whatsapp_groups boolean default true not null
);

create table if not exists public.units (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  name text not null,
  address text,
  phone text,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.profiles (
  id uuid not null,
  full_name text not null,
  email text,
  avatar_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  sector text,
  is_developer boolean default false,
  is_tester boolean default false,
  is_blocked boolean default false not null,
  last_seen_at timestamp with time zone,
  force_logout_at timestamp with time zone,
  organization_id uuid,
  approval_status text default 'aprovado'::text not null
);

create table if not exists public.user_roles (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  role app_role not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.organization_members (
  user_id uuid not null,
  organization_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.role_permissions (
  id uuid default gen_random_uuid() not null,
  role text not null,
  module_key text not null,
  has_access boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.app_modules (
  id uuid default gen_random_uuid() not null,
  key text not null,
  name text not null,
  description text,
  status text default 'published'::text not null,
  visibility text default 'all'::text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.app_versions (
  id uuid default gen_random_uuid() not null,
  version text not null,
  description text,
  released_at timestamp with time zone default now(),
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.theme_settings (
  id uuid default gen_random_uuid() not null,
  app_name text,
  primary_color text,
  accent_color text,
  background_color text,
  logo_url text,
  favicon_url text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.error_logs (
  id uuid default gen_random_uuid() not null,
  error_message text not null,
  error_stack text,
  page_url text,
  user_id uuid,
  severity text default 'error'::text not null,
  status text default 'open'::text not null,
  developer_note text,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone
);

create table if not exists public.listas (
  id uuid default gen_random_uuid() not null,
  tipo text not null,
  valor text not null,
  ativo boolean default true,
  created_at timestamp with time zone default now() not null,
  organization_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table if not exists public.login_attempts (
  email text not null,
  failed_count integer default 0 not null,
  blocked boolean default false not null,
  reset_sent_at timestamp with time zone,
  last_attempt_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.crm_installations (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  unit_id uuid,
  key text not null,
  name text not null,
  manifest jsonb default '{}'::jsonb not null,
  status text default 'active'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone
);

create table if not exists public.crm_members (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  user_id uuid not null,
  permissions text[] default '{}'::text[] not null,
  active boolean default true not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.whatsapp_connections (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  installation_id uuid,
  unit_id uuid,
  provider text default 'evolution'::text not null,
  instance_name text,
  instance_id text,
  phone_number text,
  status text default 'disconnected'::text not null,
  base_url text,
  secret_reference text,
  webhook_secret text default replace((gen_random_uuid())::text, '-'::text, ''::text) not null,
  last_status_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  api_key text,
  last_import_at timestamp with time zone,
  last_import_stats jsonb,
  display_name text,
  is_default boolean default false not null,
  is_active boolean default true not null,
  sector text,
  default_assignee_id uuid,
  keepalive_req_id bigint,
  keepalive_last_state text,
  keepalive_last_ok_at timestamp with time zone,
  keepalive_last_restart_at timestamp with time zone,
  history_import_state jsonb
);

create table if not exists public.crm_connection_members (
  organization_id uuid not null,
  connection_id uuid not null,
  user_id uuid not null,
  access_level text default 'agent'::text not null,
  active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.crm_contacts (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  installation_id uuid,
  patient_id uuid,
  name text,
  phone text,
  phone_normalized text generated always as (crm_normalize_phone(phone)) stored,
  avatar_url text,
  city text,
  unit_id uuid,
  is_lead boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid,
  deleted_at timestamp with time zone,
  opt_out boolean default false not null,
  wa_jid text,
  avatar_synced_at timestamp with time zone,
  avatar_source_key text
);

create table if not exists public.conversations (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  installation_id uuid,
  contact_id uuid not null,
  connection_id uuid,
  status text default 'novo'::text not null,
  assignee_id uuid,
  unit_id uuid,
  interest_procedure_id uuid,
  priority text,
  is_new_lead boolean default true not null,
  unread_count integer default 0 not null,
  last_message_preview text,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  ai_mode text default 'default'::text not null,
  greeted_at timestamp with time zone,
  away_sent_at timestamp with time zone,
  routing_sector text
);

create table if not exists public.messages (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  conversation_id uuid not null,
  direction text not null,
  type text default 'text'::text not null,
  content text,
  media_url text,
  provider_message_id text,
  sender_user_id uuid,
  delivery_status text default 'pending'::text not null,
  message_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  is_ai boolean default false not null,
  delivery_error text
);

create table if not exists public.conversation_assignments (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  conversation_id uuid not null,
  assignee_id uuid,
  assigned_by uuid,
  assigned_at timestamp with time zone default now() not null
);

create table if not exists public.crm_leads (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  contact_id uuid,
  patient_id uuid,
  budget_id uuid,
  status text default 'novo'::text not null,
  temperature text,
  source text,
  interest_procedure_id uuid,
  main_objection text,
  estimated_value numeric,
  unit_id uuid,
  consent boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  connection_id uuid
);

create table if not exists public.tags (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  installation_id uuid,
  label text not null,
  color text,
  created_at timestamp with time zone default now() not null,
  external_id text,
  source text default 'crm'::text not null
);

create table if not exists public.contact_tags (
  organization_id uuid not null,
  contact_id uuid not null,
  tag_id uuid not null
);

create table if not exists public.quick_replies (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  installation_id uuid,
  title text not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  shortcut text,
  category text,
  uses integer default 0 not null
);

create table if not exists public.internal_notes (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  conversation_id uuid,
  contact_id uuid,
  body text not null,
  author_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.followups (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  conversation_id uuid,
  contact_id uuid,
  due_at timestamp with time zone not null,
  note text,
  status text default 'pendente'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.campaigns (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  installation_id uuid,
  name text not null,
  message_template text not null,
  filters jsonb default '{}'::jsonb not null,
  status text default 'rascunho'::text not null,
  scheduled_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  connection_id uuid
);

create table if not exists public.campaign_recipients (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  campaign_id uuid not null,
  contact_id uuid not null,
  conversation_id uuid,
  message_id uuid,
  status text default 'queued'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.ai_agent_settings (
  organization_id uuid not null,
  enabled boolean default false not null,
  auto_reply boolean default true not null,
  auto_classify boolean default true not null,
  auto_ocr boolean default true not null,
  model text default 'gpt-5-mini'::text not null,
  extra_prompt text,
  max_replies_per_conversation integer default 20 not null,
  updated_at timestamp with time zone default now() not null,
  ocr_min_confidence numeric(4,3) default 0.750 not null,
  ocr_create_financial_pending boolean default true not null
);

create table if not exists public.ai_profiles (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  installation_id uuid,
  name text not null,
  base_prompt text,
  tone text,
  restrictions text,
  version integer default 1 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.ai_suggestions (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  conversation_id uuid,
  kind text not null,
  input jsonb,
  output text,
  model text,
  approved_by uuid,
  used boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.ai_quick_responses (
  id uuid default gen_random_uuid() not null,
  config_id uuid,
  title text not null,
  content text not null,
  category text default 'general'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  organization_id uuid default '00000000-0000-0000-0000-000000000001'::uuid not null
);

create table if not exists public.crm_auto_messages (
  organization_id uuid not null,
  greeting_enabled boolean default false not null,
  greeting_text text default 'Olá, {nome_cliente}! 👋 Seja bem-vindo(a) ao Instituto Vert. Em breve um de nossos atendentes vai te responder.'::text not null,
  away_enabled boolean default false not null,
  away_text text default 'Olá, {nome_cliente}! No momento estamos fora do nosso horário de atendimento. Retornaremos assim que possível. 😊'::text not null,
  business_hours jsonb default '{"1": ["08:00", "18:00"], "2": ["08:00", "18:00"], "3": ["08:00", "18:00"], "4": ["08:00", "18:00"], "5": ["08:00", "18:00"], "6": ["08:00", "13:00"]}'::jsonb not null,
  timezone text default 'America/Sao_Paulo'::text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.crm_keepalive_state (
  id integer default 1 not null,
  req_id bigint,
  last_state text,
  last_ok_at timestamp with time zone,
  last_restart_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  guardian_secret text default replace((gen_random_uuid())::text, '-'::text, ''::text),
  last_docker_restart_at timestamp with time zone
);

create table if not exists public.webhook_inbox (
  id uuid default gen_random_uuid() not null,
  organization_id uuid,
  connection_id uuid,
  provider text default 'evolution'::text not null,
  event_type text,
  payload jsonb,
  status text default 'received'::text not null,
  received_at timestamp with time zone default now() not null
);

create table if not exists public.provider_events (
  id uuid default gen_random_uuid() not null,
  organization_id uuid,
  connection_id uuid,
  provider text default 'evolution'::text not null,
  dedupe_key text not null,
  event_type text,
  status text default 'processed'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.domain_events (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  event_type text not null,
  event_version integer default 1 not null,
  conversation_id uuid,
  contact_id uuid,
  payload jsonb,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  dispatched_at timestamp with time zone
);

-- crm_leads: cinco colunas criadas direto em producao depois do baseline de
-- 01/09 (origem do lead no site institutovert.app). Conferido no catalogo de
-- producao em 30/10/2026: todas nulas, sem default.
alter table public.crm_leads add column if not exists intent text;
alter table public.crm_leads add column if not exists source_surface text;
alter table public.crm_leads add column if not exists utm jsonb;
alter table public.crm_leads add column if not exists entry_page text;
alter table public.crm_leads add column if not exists entry_cta text;


-- 4. chaves primarias, unicas e checks
--
-- Cada ALTER vai num bloco que ignora "ja existe": rodar de novo nao quebra.
do $$ begin
  alter table public.ai_agent_settings add constraint ai_agent_settings_pkey PRIMARY KEY (organization_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_profiles add constraint ai_profiles_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_quick_responses add constraint ai_quick_responses_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_suggestions add constraint ai_suggestions_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.app_modules add constraint app_modules_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.app_versions add constraint app_versions_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaign_recipients add constraint campaign_recipients_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaigns add constraint campaigns_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.contact_tags add constraint contact_tags_pkey PRIMARY KEY (contact_id, tag_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversation_assignments add constraint conversation_assignments_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversations add constraint conversations_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_auto_messages add constraint crm_auto_messages_pkey PRIMARY KEY (organization_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_connection_members add constraint crm_connection_members_pkey PRIMARY KEY (connection_id, user_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_contacts add constraint crm_contacts_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_installations add constraint crm_installations_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_keepalive_state add constraint crm_keepalive_state_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_leads add constraint crm_leads_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_members add constraint crm_members_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.domain_events add constraint domain_events_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.error_logs add constraint error_logs_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.followups add constraint followups_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.internal_notes add constraint internal_notes_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.listas add constraint listas_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.login_attempts add constraint login_attempts_pkey PRIMARY KEY (email);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.organization_members add constraint organization_members_pkey PRIMARY KEY (user_id, organization_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.provider_events add constraint provider_events_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.quick_replies add constraint quick_replies_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.role_permissions add constraint role_permissions_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.tags add constraint tags_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.theme_settings add constraint theme_settings_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.units add constraint units_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.user_roles add constraint user_roles_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.webhook_inbox add constraint webhook_inbox_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.whatsapp_connections add constraint whatsapp_connections_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.app_modules add constraint app_modules_key_key UNIQUE (key);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaign_recipients add constraint campaign_recipients_campaign_id_contact_id_key UNIQUE (campaign_id, contact_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_installations add constraint crm_installations_organization_id_key_key UNIQUE (organization_id, key);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_members add constraint crm_members_organization_id_user_id_key UNIQUE (organization_id, user_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.listas add constraint listas_org_tipo_valor_key UNIQUE (organization_id, tipo, valor);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.organizations add constraint organizations_slug_key UNIQUE (slug);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.provider_events add constraint provider_events_provider_dedupe_key_key UNIQUE (provider, dedupe_key);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.role_permissions add constraint role_permissions_role_module_key_key UNIQUE (role, module_key);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.user_roles add constraint user_roles_user_id_key UNIQUE (user_id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.user_roles add constraint user_roles_user_id_role_key UNIQUE (user_id, role);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_agent_settings add constraint ai_agent_settings_ocr_confidence_check CHECK (((ocr_min_confidence >= (0)::numeric) AND (ocr_min_confidence <= (1)::numeric)));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversations add constraint conversations_ai_mode_check CHECK ((ai_mode = ANY (ARRAY['default'::text, 'on'::text, 'off'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_connection_members add constraint crm_connection_members_access_level_check CHECK ((access_level = ANY (ARRAY['viewer'::text, 'agent'::text, 'manager'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.organizations add constraint organizations_status_check CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'blocked'::text, 'canceled'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_approval_status_check CHECK ((approval_status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'recusado'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;


-- 5. chaves estrangeiras
do $$ begin
  alter table public.ai_agent_settings add constraint ai_agent_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_profiles add constraint ai_profiles_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES crm_installations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_profiles add constraint ai_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_quick_responses add constraint ai_quick_responses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_suggestions add constraint ai_suggestions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.ai_suggestions add constraint ai_suggestions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaign_recipients add constraint campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaign_recipients add constraint campaign_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaign_recipients add constraint campaign_recipients_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaigns add constraint campaigns_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE RESTRICT;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaigns add constraint campaigns_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES crm_installations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.campaigns add constraint campaigns_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.contact_tags add constraint contact_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.contact_tags add constraint contact_tags_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.contact_tags add constraint contact_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversation_assignments add constraint conversation_assignments_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversation_assignments add constraint conversation_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversations add constraint conversations_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversations add constraint conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversations add constraint conversations_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES crm_installations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversations add constraint conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.conversations add constraint conversations_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_auto_messages add constraint crm_auto_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_connection_members add constraint crm_connection_members_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_connection_members add constraint crm_connection_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_connection_members add constraint crm_connection_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_connection_members add constraint crm_connection_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_contacts add constraint crm_contacts_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES crm_installations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_contacts add constraint crm_contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_contacts add constraint crm_contacts_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_installations add constraint crm_installations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_installations add constraint crm_installations_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_leads add constraint crm_leads_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE RESTRICT;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_leads add constraint crm_leads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_leads add constraint crm_leads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.crm_leads add constraint crm_leads_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.domain_events add constraint domain_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.error_logs add constraint error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.followups add constraint followups_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.followups add constraint followups_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.followups add constraint followups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.internal_notes add constraint internal_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.internal_notes add constraint internal_notes_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.internal_notes add constraint internal_notes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.listas add constraint listas_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.messages add constraint messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.messages add constraint messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.organization_members add constraint organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.organization_members add constraint organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.organizations add constraint organizations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.profiles add constraint profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.quick_replies add constraint quick_replies_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES crm_installations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.quick_replies add constraint quick_replies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.tags add constraint tags_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES crm_installations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.tags add constraint tags_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.units add constraint units_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.user_roles add constraint user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.whatsapp_connections add constraint whatsapp_connections_default_assignee_id_fkey FOREIGN KEY (default_assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.whatsapp_connections add constraint whatsapp_connections_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES crm_installations(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.whatsapp_connections add constraint whatsapp_connections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.whatsapp_connections add constraint whatsapp_connections_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;

-- FKs do banco antigo que NAO foram criadas: apontavam para tabelas que nao
-- existem neste banco. As colunas continuam (uuid simples), com o valor que vier
-- na migracao de dados.
--   ai_quick_responses.config_id -> ai_agent_configs  (ai_quick_responses_config_id_fkey): tabela da Clara (VertControl), nao migra para o CRM
--   conversations.interest_procedure_id -> procedures  (conversations_interest_procedure_id_fkey): vai apontar para o banco externo (procedimentos)
--   crm_contacts.patient_id -> patients  (crm_contacts_patient_id_fkey): vai apontar para o banco externo de pacientes
--   crm_leads.budget_id -> budgets  (crm_leads_budget_id_fkey): vai apontar para o banco externo (orcamentos)
--   crm_leads.interest_procedure_id -> procedures  (crm_leads_interest_procedure_id_fkey): vai apontar para o banco externo (procedimentos)
--   crm_leads.patient_id -> patients  (crm_leads_patient_id_fkey): vai apontar para o banco externo de pacientes
comment on column public.ai_quick_responses.config_id is 'Sem FK: tabela da Clara (VertControl), nao migra para o CRM. Antes apontava para ai_agent_configs(id) no VertControl.';
comment on column public.conversations.interest_procedure_id is 'Sem FK: vai apontar para o banco externo (procedimentos). Antes apontava para procedures(id) no VertControl.';
comment on column public.crm_contacts.patient_id is 'Sem FK: vai apontar para o banco externo de pacientes. Antes apontava para patients(id) no VertControl.';
comment on column public.crm_leads.budget_id is 'Sem FK: vai apontar para o banco externo (orcamentos). Antes apontava para budgets(id) no VertControl.';
comment on column public.crm_leads.interest_procedure_id is 'Sem FK: vai apontar para o banco externo (procedimentos). Antes apontava para procedures(id) no VertControl.';
comment on column public.crm_leads.patient_id is 'Sem FK: vai apontar para o banco externo de pacientes. Antes apontava para patients(id) no VertControl.';


-- 6. indices
CREATE INDEX IF NOT EXISTS idx_ai_profiles_org ON public.ai_profiles USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_quick_responses_organization_id ON public.ai_quick_responses USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_conv ON public.ai_suggestions USING btree (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaigns_connection_idx ON public.campaigns USING btree (connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON public.campaigns USING btree (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversations_connection_activity_idx ON public.conversations USING btree (connection_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_assignee ON public.conversations USING btree (assignee_id);
CREATE INDEX IF NOT EXISTS idx_conversations_connection_id ON public.conversations USING btree (connection_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON public.conversations USING btree (contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_last ON public.conversations USING btree (organization_id, last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_org_contact_connection ON public.conversations USING btree (organization_id, contact_id, connection_id) WHERE (connection_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_org_contact_without_connection ON public.conversations USING btree (organization_id, contact_id) WHERE (connection_id IS NULL);
CREATE INDEX IF NOT EXISTS crm_connection_members_org_idx ON public.crm_connection_members USING btree (organization_id, connection_id);
CREATE INDEX IF NOT EXISTS crm_connection_members_user_idx ON public.crm_connection_members USING btree (user_id, active, connection_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_patient ON public.crm_contacts USING btree (patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_contacts_org_phone ON public.crm_contacts USING btree (organization_id, phone_normalized) WHERE (phone_normalized <> ''::text);
CREATE INDEX IF NOT EXISTS idx_crm_installations_org ON public.crm_installations USING btree (organization_id);
CREATE INDEX IF NOT EXISTS crm_leads_connection_idx ON public.crm_leads USING btree (connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_contact ON public.crm_leads USING btree (contact_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_org ON public.domain_events USING btree (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON public.error_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_status ON public.error_logs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_listas_organization_id ON public.listas USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON public.messages USING btree (conversation_id, message_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_provider ON public.messages USING btree (organization_id, provider_message_id) WHERE (provider_message_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles USING btree (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles USING btree (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS tags_org_external_uidx ON public.tags USING btree (organization_id, external_id) WHERE ((source = 'whatsapp'::text) AND (external_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_org_label ON public.tags USING btree (organization_id, lower(label));
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_org_source_external ON public.tags USING btree (organization_id, source, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_conn ON public.webhook_inbox USING btree (connection_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_connections_org ON public.whatsapp_connections USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_default_assignee ON public.whatsapp_connections USING btree (default_assignee_id) WHERE ((is_active = true) AND (default_assignee_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_org_active ON public.whatsapp_connections USING btree (organization_id, is_active, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_connections_org_default ON public.whatsapp_connections USING btree (organization_id) WHERE is_default;


-- 7. funcoes
--
-- Copiadas do baseline, que confere byte a byte com pg_get_functiondef de
-- producao em 30/10/2026 (md5 das 62 definicoes). Duas foram reescritas porque
-- liam a tabela patients, que nao existe aqui: ver o fim desta secao.

CREATE OR REPLACE FUNCTION public.crm_nome_de_pessoa(_v text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- devolve o nome quando é aproveitável, senão null.
  -- descarta vazio, só número, e coisas sem nenhuma letra (".", "🍀", "...").
  select case
           when nullif(btrim(coalesce(_v, '')), '') is null then null
           when btrim(_v) !~ '\w' then null
           when btrim(_v) ~ '^\+?[0-9][0-9\s().-]*$' then null
           else btrim(_v)
         end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_current_org()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select organization_id from public.profiles where id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.crm_can_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_role(auth.uid(),'super_admin')
      or public.has_role(auth.uid(),'admin')
      or public.has_role(auth.uid(),'gestor')
      or public.has_role(auth.uid(),'atendente')
      or public.has_role(auth.uid(),'recepcao');
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT private_security.has_role(_user_id, _role)
      OR (_role = 'admin'::public.app_role
          AND private_security.has_role(_user_id, 'super_admin'::public.app_role));
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS app_role
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN private_security.get_my_role();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_user_role(_user_id uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM private_security.assign_user_role(_user_id, _role);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT is_developer FROM public.profiles WHERE id = _user_id), false)
    OR public.has_role(_user_id, 'super_admin'::public.app_role);
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_active(_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = _org_id
      AND (
        o.status = 'active'
        OR (o.status = 'trial' AND o.trial_ends_at > now())
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_dev_or_super(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((SELECT is_developer FROM public.profiles WHERE id = _user_id), false)
    OR public.has_role(_user_id, 'super_admin'::public.app_role)
    OR public.has_role(_user_id, 'admin'::public.app_role);
$function$
;

CREATE OR REPLACE FUNCTION public.set_org_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid()) THEN
    v_org := public.get_user_org_id();
    IF v_org IS NOT NULL THEN
      NEW.organization_id := v_org;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end; $function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_organizations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_validate_whatsapp_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.default_assignee_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.default_assignee_id
      and p.organization_id = new.organization_id
      and coalesce(p.is_blocked, false) = false
  ) then
    raise exception 'responsavel invalido para esta organizacao';
  end if;
  new.sector := nullif(trim(new.sector), '');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_admin_to_first_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Verifica se não existe nenhum usuário em user_roles ainda
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email, approval_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Usuário'),
    new.email,
    case
      when coalesce(new.raw_app_meta_data->>'provider', '') = 'google'
       and not exists (
         select 1 from public.profiles p where lower(p.email) = lower(new.email)
       )
      then 'pendente'
      else 'aprovado'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_confirm_new_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_login_attempts_on_pw_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    delete from public.login_attempts where email = lower(new.email);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.aprovar_usuario(_user_id uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if not (public.has_role(v_uid, 'admin') or public.has_role(v_uid, 'super_admin')) then
    raise exception 'Apenas administradores podem liberar acesso';
  end if;

  select organization_id into v_org from public.profiles where id = v_uid;
  if v_org is null then
    raise exception 'Seu usuário não está ligado a uma organização';
  end if;

  update public.profiles
  set organization_id = v_org,
      approval_status = 'aprovado',
      updated_at = now()
  where id = _user_id
    and approval_status = 'pendente';

  if not found then
    raise exception 'Usuário não está aguardando liberação';
  end if;

  delete from public.user_roles where user_id = _user_id;
  insert into public.user_roles (user_id, role) values (_user_id, _role)
  on conflict do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recusar_usuario(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if not (public.has_role(v_uid, 'admin') or public.has_role(v_uid, 'super_admin')) then
    raise exception 'Apenas administradores podem recusar acesso';
  end if;

  update public.profiles
  set approval_status = 'recusado',
      organization_id = null,
      updated_at = now()
  where id = _user_id
    and approval_status = 'pendente';

  if not found then
    raise exception 'Usuário não está aguardando liberação';
  end if;

  delete from public.user_roles where user_id = _user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.my_organizations()
 RETURNS SETOF organizations
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.* from public.organizations o
  where has_role(auth.uid(), 'super_admin'::app_role)
     or exists (select 1 from public.organization_members m
                where m.organization_id = o.id and m.user_id = auth.uid())
     or o.id = (select organization_id from public.profiles where id = auth.uid())
  order by o.name;
$function$
;

CREATE OR REPLACE FUNCTION public.set_active_organization(_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (
    has_role(auth.uid(), 'super_admin'::app_role)
    or exists (select 1 from public.organization_members m
               where m.organization_id = _org and m.user_id = auth.uid())
  ) then
    raise exception 'Você não tem acesso a esta clínica.';
  end if;
  update public.profiles set organization_id = _org where id = auth.uid();
end $function$
;

CREATE OR REPLACE FUNCTION public.crm_ingest_message(_org uuid, _connection uuid, _phone text, _push_name text, _direction text, _content text, _provider_msg_id text, _msg_at timestamp with time zone, _type text DEFAULT 'text'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_norm text; v_patient uuid; v_contact uuid; v_conv uuid; v_msg uuid;
  v_install uuid; v_default_assignee uuid; v_sector text;
  v_new_contact boolean := false; v_name text;
begin
  select installation_id, default_assignee_id, sector
    into v_install, v_default_assignee, v_sector
  from public.whatsapp_connections
  where id = _connection and organization_id = _org and is_active
  limit 1;

  if _connection is null or not found then raise exception 'conexao de WhatsApp invalida'; end if;

  v_norm := public.crm_normalize_phone(_phone);
  if v_norm is null or v_norm = '' then return null; end if;
  v_patient := public.crm_match_patient(_org, v_norm);
  v_name := case when _direction = 'in' then public.crm_nome_de_pessoa(_push_name) else null end;

  select id into v_contact from public.crm_contacts
  where organization_id = _org and phone_normalized = v_norm and deleted_at is null limit 1;

  if v_contact is null then
    insert into public.crm_contacts (organization_id, installation_id, patient_id, name, phone)
    values (_org, v_install, v_patient, coalesce(v_name, _phone), _phone)
    returning id into v_contact;
    v_new_contact := true;
  else
    update public.crm_contacts
    set patient_id = coalesce(patient_id, v_patient),
        name = case when v_name is not null and (name is null or name = phone or name = phone_normalized)
          then v_name else name end
    where id = v_contact;
  end if;

  select id into v_conv from public.conversations
  where organization_id = _org and contact_id = v_contact and connection_id = _connection
  order by last_message_at desc nulls last limit 1;

  if v_conv is null then
    insert into public.conversations (
      organization_id, installation_id, connection_id, contact_id,
      status, is_new_lead, assignee_id, routing_sector
    ) values (_org, v_install, _connection, v_contact, 'novo', false, v_default_assignee, v_sector)
    returning id into v_conv;
  elsif _direction = 'in' then
    update public.conversations
    set status = case when status = 'finalizado' then 'novo' else status end,
        assignee_id = coalesce(assignee_id, v_default_assignee),
        routing_sector = coalesce(routing_sector, v_sector)
    where id = v_conv;
  end if;

  insert into public.messages (
    organization_id, conversation_id, direction, type, content,
    provider_message_id, delivery_status, message_at
  ) values (
    _org, v_conv, _direction, coalesce(_type, 'text'), _content,
    _provider_msg_id, case when _direction = 'in' then 'read' else 'sent' end,
    coalesce(_msg_at, now())
  )
  on conflict (organization_id, provider_message_id) where provider_message_id is not null
  do nothing returning id into v_msg;

  if v_msg is null then return null; end if;

  update public.conversations
  set last_message_preview = left(coalesce(_content, ''), 120),
      last_message_at = coalesce(_msg_at, now()),
      unread_count = case when _direction = 'in' then unread_count + 1 else unread_count end,
      updated_at = now()
  where id = v_conv;

  insert into public.domain_events (organization_id, event_type, conversation_id, contact_id, payload)
  values (
    _org, case when _direction = 'in' then 'message.received' else 'message.sent' end,
    v_conv, v_contact,
    jsonb_build_object('messageId', v_msg, 'direction', _direction, 'content', _content,
      'phone', _phone, 'connectionId', _connection, 'newContact', v_new_contact,
      'isPatient', (v_patient is not null))
  );
  return v_msg;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_backfill_message(_org uuid, _connection uuid, _phone text, _push_name text, _direction text, _content text, _provider_msg_id text, _msg_at timestamp with time zone, _type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_norm text; v_patient uuid; v_contact uuid; v_conv uuid; v_msg uuid;
  v_install uuid; v_sector text; v_default_assignee uuid; v_name text;
begin
  select installation_id, default_assignee_id, sector
    into v_install, v_default_assignee, v_sector
  from public.whatsapp_connections
  where id = _connection and organization_id = _org
  limit 1;
  if not found then raise exception 'conexao de WhatsApp invalida'; end if;

  v_norm := public.crm_normalize_phone(_phone);
  if v_norm is null or v_norm = '' then return null; end if;
  v_patient := public.crm_match_patient(_org, v_norm);
  v_name := case when _direction = 'in' then public.crm_nome_de_pessoa(_push_name) else null end;

  select id into v_contact from public.crm_contacts
  where organization_id = _org and phone_normalized = v_norm and deleted_at is null limit 1;

  if v_contact is null then
    insert into public.crm_contacts (organization_id, installation_id, patient_id, name, phone)
    values (_org, v_install, v_patient, coalesce(v_name, _phone), _phone)
    returning id into v_contact;
  end if;

  select id into v_conv from public.conversations
  where organization_id = _org and contact_id = v_contact and connection_id = _connection
  limit 1;

  if v_conv is null then
    insert into public.conversations (
      organization_id, installation_id, connection_id, contact_id,
      status, is_new_lead, assignee_id, routing_sector
    ) values (_org, v_install, _connection, v_contact, 'novo', false, v_default_assignee, v_sector)
    returning id into v_conv;
  end if;

  insert into public.messages (
    organization_id, conversation_id, direction, type, content,
    provider_message_id, delivery_status, message_at
  ) values (
    _org, v_conv, _direction, coalesce(_type, 'text'), _content,
    _provider_msg_id, case when _direction = 'in' then 'read' else 'sent' end,
    coalesce(_msg_at, now())
  )
  on conflict (organization_id, provider_message_id) where provider_message_id is not null
  do nothing returning id into v_msg;

  if v_msg is null then return null; end if;   -- ja existia: nada mais a fazer

  -- previa: so avanca, nunca retrocede
  update public.conversations
     set last_message_preview = left(coalesce(_content, ''), 120),
         last_message_at = _msg_at,
         updated_at = now()
   where id = v_conv
     and _msg_at is not null
     and (last_message_at is null or _msg_at > last_message_at);

  return v_msg;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_import_chats(_org uuid, _connection uuid, _rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _n integer := 0; r jsonb; _norm text; _name text; _contact uuid; _conv uuid;
  _pat uuid; _install uuid; _default_assignee uuid; _sector text;
begin
  select installation_id, default_assignee_id, sector into _install, _default_assignee, _sector
  from public.whatsapp_connections
  where id = _connection and organization_id = _org and is_active limit 1;
  if _connection is null or not found then raise exception 'conexao de WhatsApp invalida'; end if;

  for r in select value from jsonb_array_elements(_rows) as value loop
    _norm := public.crm_normalize_phone(r->>'phone');
    if _norm is null or _norm = '' then continue; end if;
    _name := nullif(trim(r->>'name'), '');
    _pat := public.crm_match_patient(_org, _norm);

    select id into _contact from public.crm_contacts
    where organization_id = _org and phone_normalized = _norm and deleted_at is null limit 1;

    if _contact is null then
      insert into public.crm_contacts (organization_id, installation_id, phone, name, wa_jid, patient_id, is_lead)
      values (_org, _install, r->>'phone', coalesce(_name, r->>'phone'), nullif(trim(r->>'jid'), ''), _pat, false)
      returning id into _contact;
    else
      update public.crm_contacts
      set patient_id = coalesce(patient_id, _pat),
          wa_jid = coalesce(wa_jid, nullif(trim(r->>'jid'), '')),
          name = case when _name is not null and (name is null or name = phone or name = phone_normalized)
            then _name else name end
      where id = _contact;
    end if;

    select id into _conv from public.conversations
    where organization_id = _org and contact_id = _contact and connection_id = _connection limit 1;

    if _conv is null then
      insert into public.conversations (
        organization_id, installation_id, contact_id, connection_id, status,
        is_new_lead, assignee_id, routing_sector, last_message_preview, last_message_at
      ) values (
        _org, _install, _contact, _connection, 'novo', false, _default_assignee, _sector,
        nullif(r->>'last_message', ''), coalesce(nullif(r->>'last_at', '')::timestamptz, now())
      ) returning id into _conv;
      _n := _n + 1;
    else
      update public.conversations
      set assignee_id = coalesce(assignee_id, _default_assignee),
          routing_sector = coalesce(routing_sector, _sector),
          last_message_preview = coalesce(nullif(r->>'last_message', ''), last_message_preview),
          last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz),
            coalesce(nullif(r->>'last_at', '')::timestamptz, 'epoch'::timestamptz))
      where id = _conv;
    end if;
  end loop;
  return _n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_import_labels(_org uuid, _rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _n int := 0; r jsonb; _ext text; _label text; _color text; _install uuid; _hit boolean;
begin
  select id into _install from public.crm_installations
   where organization_id = _org and status = 'active' order by created_at limit 1;

  for r in select value from jsonb_array_elements(_rows) as value loop
    _ext   := nullif(trim(r->>'external_id'), '');
    _label := nullif(trim(r->>'label'), '');
    _color := nullif(trim(r->>'color'), '');
    if _label is null then continue; end if;

    -- 1) já conhecida pelo id do WhatsApp: atualiza só a cor.
    --    O texto é preservado de propósito — quem renomeia é o usuário.
    if _ext is not null then
      update public.tags t
         set color = coalesce(_color, t.color), source = 'whatsapp'
       where t.organization_id = _org and t.source = 'whatsapp' and t.external_id = _ext;
      get diagnostics _hit = row_count;
      if _hit then _n := _n + 1; continue; end if;
    end if;

    -- 2) etiqueta criada no CRM com o mesmo nome: adota o id do WhatsApp.
    update public.tags t
       set external_id = _ext, color = coalesce(_color, t.color), source = 'whatsapp'
     where t.organization_id = _org and lower(t.label) = lower(_label) and t.external_id is null;
    get diagnostics _hit = row_count;
    if _hit then _n := _n + 1; continue; end if;

    -- 3) nova de fato.
    insert into public.tags (organization_id, installation_id, label, color, external_id, source)
    values (_org, _install, _label, _color, _ext, 'whatsapp')
    on conflict (organization_id, lower(label)) do update
      set color = coalesce(excluded.color, public.tags.color),
          external_id = coalesce(public.tags.external_id, excluded.external_id),
          source = 'whatsapp';
    _n := _n + 1;
  end loop;
  return _n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_apply_chat_labels(_org uuid, _rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _n int := 0; r jsonb; _norm text; _contact uuid; _lab text; _tag uuid;
begin
  for r in select value from jsonb_array_elements(_rows) as value loop
    _norm := public.crm_normalize_phone(r->>'phone');
    if _norm is null or _norm = '' then continue; end if;

    select id into _contact from public.crm_contacts
      where organization_id = _org and phone_normalized = _norm and deleted_at is null limit 1;
    if _contact is null then continue; end if;

    delete from public.contact_tags ct
     using public.tags t
     where ct.contact_id = _contact and ct.tag_id = t.id
       and t.source = 'whatsapp'
       and t.external_id is not null
       and not exists (
             select 1 from jsonb_array_elements_text(coalesce(r->'labels', '[]'::jsonb)) l
             where l = t.external_id);

    for _lab in select jsonb_array_elements_text(coalesce(r->'labels', '[]'::jsonb)) loop
      select id into _tag from public.tags
        where organization_id = _org and source = 'whatsapp' and external_id = _lab limit 1;
      if _tag is null then continue; end if;
      insert into public.contact_tags (organization_id, contact_id, tag_id)
      values (_org, _contact, _tag)
      on conflict (contact_id, tag_id) do nothing;
      _n := _n + 1;
    end loop;
  end loop;
  return _n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_toggle_chat_label(_org uuid, _phone text, _label_ext text, _add boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _norm text; _contact uuid; _tag uuid;
begin
  _norm := public.crm_normalize_phone(_phone);
  if _norm is null or _norm = '' then return false; end if;

  select id into _contact from public.crm_contacts
    where organization_id = _org and phone_normalized = _norm and deleted_at is null limit 1;
  if _contact is null then return false; end if;

  select id into _tag from public.tags
    where organization_id = _org and source = 'whatsapp' and external_id = _label_ext limit 1;
  if _tag is null then return false; end if;

  if _add then
    insert into public.contact_tags (organization_id, contact_id, tag_id)
    values (_org, _contact, _tag)
    on conflict (contact_id, tag_id) do nothing;
  else
    delete from public.contact_tags where contact_id = _contact and tag_id = _tag;
  end if;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_start_conversation(_phone text, _name text DEFAULT NULL::text, _patient uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.crm_start_conversation(_phone, _name, _patient, null);
$function$
;

CREATE OR REPLACE FUNCTION public.crm_start_conversation(_phone text, _name text, _patient uuid, _connection uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  _org uuid; _conn uuid; _install uuid; _default_assignee uuid; _sector text;
  _contact uuid; _conv uuid; _norm text; _pat uuid; _nm text;
begin
  select organization_id into _org from public.profiles where id = auth.uid();
  if _org is null then raise exception 'sem organizacao'; end if;

  select id, installation_id, default_assignee_id, sector
  into _conn, _install, _default_assignee, _sector
  from public.whatsapp_connections
  where organization_id = _org
    and is_active
    and (_connection is null or id = _connection)
    and private.crm_can_access_connection(id, true)
  order by case when id = _connection then 0 else 1 end, is_default desc, created_at asc
  limit 1;
  if _conn is null then raise exception 'acesso ao painel de WhatsApp negado'; end if;

  _norm := public.crm_normalize_phone(_phone);
  if _norm is null or length(_norm) < 10 then raise exception 'telefone invalido'; end if;
  _nm := nullif(trim(_name), '');
  _pat := coalesce(_patient, public.crm_match_patient(_org, _norm));

  select id into _contact from public.crm_contacts
  where organization_id = _org and phone_normalized = _norm and deleted_at is null limit 1;

  if _contact is null then
    insert into public.crm_contacts (
      organization_id, installation_id, phone, name, patient_id, is_lead, created_by
    ) values (_org, _install, _phone, coalesce(_nm, _phone), _pat, false, auth.uid())
    returning id into _contact;
  else
    update public.crm_contacts
    set patient_id = coalesce(patient_id, _pat),
        name = case when _nm is not null and (name is null or name = phone or name = phone_normalized)
          then _nm else name end
    where id = _contact;
  end if;

  select id into _conv from public.conversations
  where organization_id = _org and contact_id = _contact and connection_id = _conn limit 1;

  if _conv is null then
    insert into public.conversations (
      organization_id, installation_id, contact_id, connection_id,
      status, is_new_lead, assignee_id, routing_sector
    ) values (_org, _install, _contact, _conn, 'novo', false, _default_assignee, _sector)
    returning id into _conv;
  end if;
  return _conv;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_report(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with org as (select public.crm_current_org() as id)
  select jsonb_build_object(
    'new_leads', (select count(*) from public.crm_contacts c, org where c.organization_id=org.id and c.is_lead and c.created_at between _from and _to),
    'contacts_total', (select count(*) from public.crm_contacts c, org where c.organization_id=org.id),
    'patients_linked', (select count(*) from public.crm_contacts c, org where c.organization_id=org.id and c.patient_id is not null),
    'conversations_total', (select count(*) from public.conversations cv, org where cv.organization_id=org.id),
    'conversations_period', (select count(*) from public.conversations cv, org where cv.organization_id=org.id and cv.created_at between _from and _to),
    'messages_in', (select count(*) from public.messages m, org where m.organization_id=org.id and m.direction='in' and m.message_at between _from and _to),
    'messages_out', (select count(*) from public.messages m, org where m.organization_id=org.id and m.direction='out' and m.message_at between _from and _to),
    'failed_sends', (select count(*) from public.messages m, org where m.organization_id=org.id and m.delivery_status='failed' and m.message_at between _from and _to),
    'followups_pending', (select count(*) from public.followups f, org where f.organization_id=org.id and f.status='pendente'),
    'campaigns', (select count(*) from public.campaigns c, org where c.organization_id=org.id),
    'by_status', (select coalesce(jsonb_object_agg(status, cnt),'{}'::jsonb) from (select cv.status, count(*) cnt from public.conversations cv, org where cv.organization_id=org.id group by cv.status) s),
    'avg_first_response_seconds', (
       select coalesce(round(avg(extract(epoch from (fo.first_out - fi.first_in)))),0)::int
       from public.conversations cv, org,
         lateral (select min(message_at) first_in from public.messages where conversation_id=cv.id and direction='in') fi,
         lateral (select min(message_at) first_out from public.messages where conversation_id=cv.id and direction='out') fo
       where cv.organization_id=org.id and cv.created_at between _from and _to
         and fo.first_out is not null and fi.first_in is not null and fo.first_out >= fi.first_in
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.crm_report(_from timestamp with time zone, _to timestamp with time zone, _connection uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  _org uuid := public.crm_current_org();
  _result jsonb;
begin
  if not private.crm_can_access_connection(_connection, false) then
    raise exception 'acesso ao painel de WhatsApp negado';
  end if;

  select jsonb_build_object(
    'new_leads', (select count(*) from public.crm_leads l where l.organization_id=_org and l.connection_id=_connection and l.created_at between _from and _to),
    'contacts_total', (select count(distinct c.contact_id) from public.conversations c where c.organization_id=_org and c.connection_id=_connection),
    'patients_linked', (select count(distinct c.contact_id) from public.conversations c join public.crm_contacts ct on ct.id=c.contact_id where c.organization_id=_org and c.connection_id=_connection and ct.patient_id is not null),
    'conversations_total', (select count(*) from public.conversations c where c.organization_id=_org and c.connection_id=_connection),
    'conversations_period', (select count(*) from public.conversations c where c.organization_id=_org and c.connection_id=_connection and c.created_at between _from and _to),
    'messages_in', (select count(*) from public.messages m join public.conversations c on c.id=m.conversation_id where c.organization_id=_org and c.connection_id=_connection and m.direction='in' and m.message_at between _from and _to),
    'messages_out', (select count(*) from public.messages m join public.conversations c on c.id=m.conversation_id where c.organization_id=_org and c.connection_id=_connection and m.direction='out' and m.message_at between _from and _to),
    'failed_sends', (select count(*) from public.messages m join public.conversations c on c.id=m.conversation_id where c.organization_id=_org and c.connection_id=_connection and m.delivery_status='failed' and m.message_at between _from and _to),
    'followups_pending', (select count(*) from public.followups f join public.conversations c on c.id=f.conversation_id where c.organization_id=_org and c.connection_id=_connection and f.status='pendente'),
    'campaigns', (select count(*) from public.campaigns c where c.organization_id=_org and c.connection_id=_connection),
    'by_status', (select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) from (select c.status, count(*) cnt from public.conversations c where c.organization_id=_org and c.connection_id=_connection group by c.status) s),
    'avg_first_response_seconds', (
      select coalesce(round(avg(extract(epoch from (fo.first_out - fi.first_in)))),0)::int
      from public.conversations c
      cross join lateral (select min(message_at) first_in from public.messages where conversation_id=c.id and direction='in') fi
      cross join lateral (select min(message_at) first_out from public.messages where conversation_id=c.id and direction='out') fo
      where c.organization_id=_org and c.connection_id=_connection and c.created_at between _from and _to
        and fo.first_out is not null and fi.first_in is not null and fo.first_out >= fi.first_in
    )
  ) into _result;
  return _result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_remove_whatsapp_connection(_connection uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_was_default boolean;
  v_next uuid;
begin
  select organization_id, is_default
    into v_org, v_was_default
  from public.whatsapp_connections
  where id = _connection and is_active
  for update;

  if v_org is null then return false; end if;

  update public.whatsapp_connections
  set is_active = false,
      is_default = false,
      status = 'disconnected',
      updated_at = now()
  where id = _connection;

  if v_was_default then
    select id into v_next
    from public.whatsapp_connections
    where organization_id = v_org and is_active
    order by created_at asc
    limit 1
    for update;

    if v_next is not null then
      update public.whatsapp_connections
      set is_default = true, updated_at = now()
      where id = v_next;
    end if;
  end if;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_whatsapp_keepalive()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  c record; resp record; v_state text; v_status text;
begin
  insert into public.crm_keepalive_state (id) values (1) on conflict (id) do nothing;

  for c in
    select id, base_url, api_key, phone_number, is_default,
           replace(instance_name, ' ', '%20') as inst,
           keepalive_req_id, keepalive_last_restart_at
      from public.whatsapp_connections
     where is_active = true
       and base_url is not null
       and api_key is not null
       and instance_name is not null
     order by is_default desc, display_name
  loop
    begin
      if c.keepalive_req_id is not null then
        select status_code, content into resp
          from net._http_response where id = c.keepalive_req_id;

        if resp.status_code = 200 then
          v_state := coalesce((resp.content::jsonb)->'instance'->>'state',
                              (resp.content::jsonb)->>'state', 'unknown');
        elsif resp.status_code is null then
          v_state := 'sem_resposta';
        else
          v_state := 'http_' || resp.status_code;
        end if;

        v_status := case when v_state = 'open' then 'connected'
                         when v_state = 'connecting' then 'connecting'
                         else 'disconnected' end;

        update public.whatsapp_connections
           set status = v_status,
               keepalive_last_state = v_state,
               keepalive_last_ok_at = case when v_state = 'open' then now()
                                           else keepalive_last_ok_at end,
               last_status_at = now()
         where id = c.id;

        if c.is_default then
          update public.crm_keepalive_state
             set last_state = v_state,
                 last_ok_at = case when v_state = 'open' then now() else last_ok_at end,
                 updated_at = now()
           where id = 1;
        end if;

        if v_state <> 'open'
           and c.phone_number is not null
           and (c.keepalive_last_restart_at is null
                or c.keepalive_last_restart_at < now() - interval '10 minutes') then
          perform net.http_post(
            url := c.base_url || '/instance/restart/' || c.inst,
            headers := jsonb_build_object('apikey', c.api_key, 'Content-Type', 'application/json'),
            body := '{}'::jsonb,
            timeout_milliseconds := 20000);
          update public.whatsapp_connections
             set keepalive_last_restart_at = now()
           where id = c.id;
          if c.is_default then
            update public.crm_keepalive_state set last_restart_at = now() where id = 1;
          end if;
        end if;
      end if;

      update public.whatsapp_connections
         set keepalive_req_id = net.http_get(
               url := c.base_url || '/instance/connectionState/' || c.inst,
               headers := jsonb_build_object('apikey', c.api_key),
               timeout_milliseconds := 20000)
       where id = c.id;
    exception when others then
      null;
    end;
  end loop;

  update public.crm_keepalive_state set updated_at = now() where id = 1;
exception when others then
  null;
end;
$function$
;

-- 7.1 funcoes reescritas para viver sem a tabela patients
--
-- crm_match_patient: no VertControl procurava em public.patients um paciente
-- com o mesmo telefone. Aqui patients nao existe; devolve sempre null, e
-- crm_contacts.patient_id fica nulo para contato novo. Mesma assinatura, mesma
-- seguranca: quem chama (crm_ingest_message, crm_backfill_message,
-- crm_import_chats, crm_import_contacts, crm_start_conversation) nao muda.
-- Quando o banco externo de pacientes existir, e aqui que a busca volta.
CREATE OR REPLACE FUNCTION public.crm_match_patient(_org uuid, _phone_norm text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- sem banco de pacientes neste projeto: nenhum contato e casado com paciente
  select null::uuid
$function$
;

-- crm_import_contacts: igual a de producao, menos o ultimo UPDATE, que copiava
-- o nome do paciente (public.patients) para o contato. Em plpgsql isso so
-- falharia na hora da chamada -- e a importacao inteira de contatos da
-- crm-import cairia junto.
CREATE OR REPLACE FUNCTION public.crm_import_contacts(_org uuid, _rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _n integer := 0; _u integer := 0;
begin
  create temporary table if not exists _imp_contacts (
    phone text, name text, jid text, avatar text, norm text
  ) on commit drop;
  delete from _imp_contacts where true;   -- "where true" satisfaz o guarda do Supabase

  insert into _imp_contacts (phone, name, jid, avatar, norm)
  select distinct on (public.crm_normalize_phone(r->>'phone'))
         r->>'phone',
         nullif(trim(r->>'name'), ''),
         nullif(trim(r->>'jid'), ''),
         nullif(trim(r->>'avatar'), ''),
         public.crm_normalize_phone(r->>'phone')
  from jsonb_array_elements(_rows) as r
  where public.crm_normalize_phone(r->>'phone') <> ''
  order by public.crm_normalize_phone(r->>'phone'),
           (nullif(trim(r->>'name'), '') is null);

  with ins as (
    insert into public.crm_contacts (organization_id, phone, name, wa_jid, avatar_url, patient_id, is_lead)
    select _org, i.phone, coalesce(i.name, i.phone), i.jid, i.avatar,
           public.crm_match_patient(_org, i.norm), false
    from _imp_contacts i
    on conflict (organization_id, phone_normalized) where (phone_normalized <> '') do nothing
    returning 1
  )
  select count(*) into _n from ins;

  with upd as (
    update public.crm_contacts c
       set name = i.name,
           wa_jid = coalesce(c.wa_jid, i.jid),
           updated_at = now()
    from _imp_contacts i
    where c.organization_id = _org
      and c.phone_normalized = i.norm
      and c.deleted_at is null
      and i.name is not null
      and (c.name is null or c.name = c.phone or c.name = c.phone_normalized)
    returning 1
  )
  select count(*) into _u from upd;

  -- foto: so vale URL interna do bucket. A URL crua da CDN do WhatsApp expira em
  -- poucos dias e nao deve ser gravada aqui (quem cuida disso e a crm-avatars).
  update public.crm_contacts c
     set avatar_url = i.avatar, updated_at = now()
  from _imp_contacts i
  where c.organization_id = _org
    and c.phone_normalized = i.norm
    and c.deleted_at is null
    and i.avatar is not null
    and i.avatar like 'wa-pics:%'
    and c.avatar_url is distinct from i.avatar;

  -- REMOVIDO em relacao a producao: o UPDATE que copiava o nome de
  -- public.patients para o contato. Sem tabela de pacientes neste banco.

  return _n + _u;
end;
$function$
;



-- 8. triggers
drop trigger if exists trg_ai_profiles_touch on public.ai_profiles;
CREATE TRIGGER trg_ai_profiles_touch BEFORE UPDATE ON public.ai_profiles FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();
drop trigger if exists trg_set_org_id on public.ai_quick_responses;
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.ai_quick_responses FOR EACH ROW EXECUTE FUNCTION set_org_id();
drop trigger if exists update_app_modules_updated_at on public.app_modules;
CREATE TRIGGER update_app_modules_updated_at BEFORE UPDATE ON public.app_modules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_campaigns_touch on public.campaigns;
CREATE TRIGGER trg_campaigns_touch BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();
drop trigger if exists trg_conversations_touch on public.conversations;
CREATE TRIGGER trg_conversations_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();
drop trigger if exists trg_crm_contacts_touch on public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_touch BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();
drop trigger if exists trg_crm_installations_touch on public.crm_installations;
CREATE TRIGGER trg_crm_installations_touch BEFORE UPDATE ON public.crm_installations FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();
drop trigger if exists trg_crm_leads_touch on public.crm_leads;
CREATE TRIGGER trg_crm_leads_touch BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();
drop trigger if exists trg_set_org_id on public.listas;
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.listas FOR EACH ROW EXECUTE FUNCTION set_org_id();
drop trigger if exists trg_organizations_updated_at on public.organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION touch_organizations_updated_at();
drop trigger if exists trg_assign_admin_to_first_user on public.profiles;
CREATE TRIGGER trg_assign_admin_to_first_user AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION assign_admin_to_first_user();
drop trigger if exists update_theme_settings_updated_at on public.theme_settings;
CREATE TRIGGER update_theme_settings_updated_at BEFORE UPDATE ON public.theme_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
drop trigger if exists trg_validate_whatsapp_assignment on public.whatsapp_connections;
CREATE TRIGGER trg_validate_whatsapp_assignment BEFORE INSERT OR UPDATE OF organization_id, default_assignee_id, sector ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION crm_validate_whatsapp_assignment();
drop trigger if exists trg_wa_connections_touch on public.whatsapp_connections;
CREATE TRIGGER trg_wa_connections_touch BEFORE UPDATE ON public.whatsapp_connections FOR EACH ROW EXECUTE FUNCTION crm_touch_updated_at();


-- 9. row level security
alter table public.ai_agent_settings enable row level security;
alter table public.ai_profiles enable row level security;
alter table public.ai_quick_responses enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.app_modules enable row level security;
alter table public.app_versions enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaigns enable row level security;
alter table public.contact_tags enable row level security;
alter table public.conversation_assignments enable row level security;
alter table public.conversations enable row level security;
alter table public.crm_auto_messages enable row level security;
alter table public.crm_connection_members enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_installations enable row level security;
alter table public.crm_keepalive_state enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_members enable row level security;
alter table public.domain_events enable row level security;
alter table public.error_logs enable row level security;
alter table public.followups enable row level security;
alter table public.internal_notes enable row level security;
alter table public.listas enable row level security;
alter table public.login_attempts enable row level security;
alter table public.messages enable row level security;
alter table public.organization_members enable row level security;
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.provider_events enable row level security;
alter table public.quick_replies enable row level security;
alter table public.role_permissions enable row level security;
alter table public.tags enable row level security;
alter table public.theme_settings enable row level security;
alter table public.units enable row level security;
alter table public.user_roles enable row level security;
alter table public.webhook_inbox enable row level security;
alter table public.whatsapp_connections enable row level security;


-- 10. policies
drop policy if exists ai_agent_settings_select on public.ai_agent_settings;
create policy ai_agent_settings_select on public.ai_agent_settings as PERMISSIVE for SELECT to public using (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists ai_agent_settings_write on public.ai_agent_settings;
create policy ai_agent_settings_write on public.ai_agent_settings as PERMISSIVE for ALL to public using ((has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role)) AND (organization_id = crm_current_org()))));
drop policy if exists ai_profiles_select on public.ai_profiles;
create policy ai_profiles_select on public.ai_profiles as PERMISSIVE for SELECT to public using (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists ai_profiles_write on public.ai_profiles;
create policy ai_profiles_write on public.ai_profiles as PERMISSIVE for ALL to public using ((has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role)) AND (organization_id = crm_current_org())))) with check ((has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role)) AND (organization_id = crm_current_org()))));
drop policy if exists "Admin and recepcao can manage quick responses" on public.ai_quick_responses;
create policy "Admin and recepcao can manage quick responses" on public.ai_quick_responses as PERMISSIVE for ALL to authenticated using ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role))) with check ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role)));
drop policy if exists "Staff can view quick responses" on public.ai_quick_responses;
create policy "Staff can view quick responses" on public.ai_quick_responses as PERMISSIVE for SELECT to authenticated using ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role)));
drop policy if exists org_isolation on public.ai_quick_responses;
create policy org_isolation on public.ai_quick_responses as RESTRICTIVE for ALL to public using ((((organization_id = get_user_org_id()) AND is_org_active(organization_id)) OR is_platform_admin(auth.uid()))) with check ((((organization_id = get_user_org_id()) AND is_org_active(organization_id)) OR is_platform_admin(auth.uid())));
drop policy if exists ai_suggestions_rw on public.ai_suggestions;
create policy ai_suggestions_rw on public.ai_suggestions as PERMISSIVE for ALL to public using (((organization_id = crm_current_org()) AND crm_can_access())) with check (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists "Modules are manageable by admins" on public.app_modules;
create policy "Modules are manageable by admins" on public.app_modules as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
drop policy if exists "Staff can view app_modules" on public.app_modules;
create policy "Staff can view app_modules" on public.app_modules as PERMISSIVE for SELECT to authenticated using ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)));
drop policy if exists "Staff can view app_versions" on public.app_versions;
create policy "Staff can view app_versions" on public.app_versions as PERMISSIVE for SELECT to authenticated using ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)));
drop policy if exists "Versions are manageable by admins" on public.app_versions;
create policy "Versions are manageable by admins" on public.app_versions as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
drop policy if exists campaign_recipients_rw on public.campaign_recipients;
create policy campaign_recipients_rw on public.campaign_recipients as PERMISSIVE for ALL to public using (((organization_id = crm_current_org()) AND crm_can_access())) with check (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns as PERMISSIVE for DELETE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns as PERMISSIVE for INSERT to authenticated with check (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns as PERMISSIVE for SELECT to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, false)));
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns as PERMISSIVE for UPDATE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true))) with check (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists contact_tags_tenant on public.contact_tags;
create policy contact_tags_tenant on public.contact_tags as PERMISSIVE for ALL to public using (((organization_id = crm_current_org()) AND crm_can_access())) with check (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists conversation_assignments_tenant on public.conversation_assignments;
create policy conversation_assignments_tenant on public.conversation_assignments as PERMISSIVE for ALL to public using (((organization_id = crm_current_org()) AND crm_can_access())) with check (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations as PERMISSIVE for DELETE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations as PERMISSIVE for INSERT to authenticated with check (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations as PERMISSIVE for SELECT to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, false)));
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations as PERMISSIVE for UPDATE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true))) with check (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists auto_messages_select on public.crm_auto_messages;
create policy auto_messages_select on public.crm_auto_messages as PERMISSIVE for SELECT to public using (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists auto_messages_write on public.crm_auto_messages;
create policy auto_messages_write on public.crm_auto_messages as PERMISSIVE for ALL to public using ((has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role)) AND (organization_id = crm_current_org()))));
drop policy if exists crm_connection_members_delete on public.crm_connection_members;
create policy crm_connection_members_delete on public.crm_connection_members as PERMISSIVE for DELETE to authenticated using (((organization_id = crm_current_org()) AND private.crm_user_is_manager()));
drop policy if exists crm_connection_members_insert on public.crm_connection_members;
create policy crm_connection_members_insert on public.crm_connection_members as PERMISSIVE for INSERT to authenticated with check (((organization_id = crm_current_org()) AND private.crm_user_is_manager() AND (EXISTS ( SELECT 1
   FROM whatsapp_connections wc
  WHERE ((wc.id = crm_connection_members.connection_id) AND (wc.organization_id = wc.organization_id))))));
drop policy if exists crm_connection_members_select on public.crm_connection_members;
create policy crm_connection_members_select on public.crm_connection_members as PERMISSIVE for SELECT to authenticated using (((user_id = auth.uid()) OR ((organization_id = crm_current_org()) AND private.crm_user_is_manager())));
drop policy if exists crm_connection_members_update on public.crm_connection_members;
create policy crm_connection_members_update on public.crm_connection_members as PERMISSIVE for UPDATE to authenticated using (((organization_id = crm_current_org()) AND private.crm_user_is_manager())) with check (((organization_id = crm_current_org()) AND private.crm_user_is_manager()));
drop policy if exists crm_contacts_delete on public.crm_contacts;
create policy crm_contacts_delete on public.crm_contacts as PERMISSIVE for DELETE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_contact(id, true)));
drop policy if exists crm_contacts_insert on public.crm_contacts;
create policy crm_contacts_insert on public.crm_contacts as PERMISSIVE for INSERT to authenticated with check (((organization_id = crm_current_org()) AND private.crm_has_any_connection_access(true)));
drop policy if exists crm_contacts_select on public.crm_contacts;
create policy crm_contacts_select on public.crm_contacts as PERMISSIVE for SELECT to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_contact(id, false)));
drop policy if exists crm_contacts_update on public.crm_contacts;
create policy crm_contacts_update on public.crm_contacts as PERMISSIVE for UPDATE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_contact(id, true))) with check ((organization_id = crm_current_org()));
drop policy if exists crm_installations_select on public.crm_installations;
create policy crm_installations_select on public.crm_installations as PERMISSIVE for SELECT to public using (((organization_id = crm_current_org()) OR has_role(auth.uid(), 'super_admin'::app_role)));
drop policy if exists crm_installations_write on public.crm_installations;
create policy crm_installations_write on public.crm_installations as PERMISSIVE for ALL to public using ((has_role(auth.uid(), 'super_admin'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND (organization_id = crm_current_org())))) with check ((has_role(auth.uid(), 'super_admin'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND (organization_id = crm_current_org()))));
drop policy if exists keepalive_read on public.crm_keepalive_state;
create policy keepalive_read on public.crm_keepalive_state as PERMISSIVE for SELECT to public using (crm_can_access());
drop policy if exists crm_leads_delete on public.crm_leads;
create policy crm_leads_delete on public.crm_leads as PERMISSIVE for DELETE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists crm_leads_insert on public.crm_leads;
create policy crm_leads_insert on public.crm_leads as PERMISSIVE for INSERT to authenticated with check (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists crm_leads_select on public.crm_leads;
create policy crm_leads_select on public.crm_leads as PERMISSIVE for SELECT to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, false)));
drop policy if exists crm_leads_update on public.crm_leads;
create policy crm_leads_update on public.crm_leads as PERMISSIVE for UPDATE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true))) with check (((organization_id = crm_current_org()) AND private.crm_can_access_connection(connection_id, true)));
drop policy if exists crm_members_read on public.crm_members;
create policy crm_members_read on public.crm_members as PERMISSIVE for SELECT to authenticated using ((organization_id = ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
drop policy if exists domain_events_select on public.domain_events;
create policy domain_events_select on public.domain_events as PERMISSIVE for SELECT to public using (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists "error_logs dev read" on public.error_logs;
create policy "error_logs dev read" on public.error_logs as PERMISSIVE for SELECT to authenticated using (is_dev_or_super(auth.uid()));
drop policy if exists "error_logs dev update" on public.error_logs;
create policy "error_logs dev update" on public.error_logs as PERMISSIVE for UPDATE to authenticated using (is_dev_or_super(auth.uid())) with check (is_dev_or_super(auth.uid()));
drop policy if exists "error_logs self insert" on public.error_logs;
create policy "error_logs self insert" on public.error_logs as PERMISSIVE for INSERT to authenticated with check (((user_id IS NULL) OR (user_id = auth.uid())));
drop policy if exists followups_tenant on public.followups;
create policy followups_tenant on public.followups as PERMISSIVE for ALL to public using (((organization_id = crm_current_org()) AND crm_can_access())) with check (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists internal_notes_tenant on public.internal_notes;
create policy internal_notes_tenant on public.internal_notes as PERMISSIVE for ALL to public using (((organization_id = crm_current_org()) AND crm_can_access())) with check (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists "Admin and financeiro can manage listas" on public.listas;
create policy "Admin and financeiro can manage listas" on public.listas as PERMISSIVE for ALL to authenticated using ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)));
drop policy if exists "Staff can view listas" on public.listas;
create policy "Staff can view listas" on public.listas as PERMISSIVE for SELECT to authenticated using ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)));
drop policy if exists org_isolation on public.listas;
create policy org_isolation on public.listas as RESTRICTIVE for ALL to public using ((((organization_id = get_user_org_id()) AND is_org_active(organization_id)) OR is_platform_admin(auth.uid()))) with check ((((organization_id = get_user_org_id()) AND is_org_active(organization_id)) OR is_platform_admin(auth.uid())));
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages as PERMISSIVE for DELETE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_conversation(conversation_id, true)));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages as PERMISSIVE for INSERT to authenticated with check (((organization_id = crm_current_org()) AND private.crm_can_access_conversation(conversation_id, true)));
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages as PERMISSIVE for SELECT to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_conversation(conversation_id, false)));
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages as PERMISSIVE for UPDATE to authenticated using (((organization_id = crm_current_org()) AND private.crm_can_access_conversation(conversation_id, true))) with check (((organization_id = crm_current_org()) AND private.crm_can_access_conversation(conversation_id, true)));
drop policy if exists org_members_manage on public.organization_members;
create policy org_members_manage on public.organization_members as PERMISSIVE for ALL to public using ((has_role(auth.uid(), 'super_admin'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND (organization_id = crm_current_org()))));
drop policy if exists org_members_select_own on public.organization_members;
create policy org_members_select_own on public.organization_members as PERMISSIVE for SELECT to public using (((user_id = auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role)));
drop policy if exists "Dono atualiza a própria organização" on public.organizations;
create policy "Dono atualiza a própria organização" on public.organizations as PERMISSIVE for UPDATE to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
drop policy if exists "Gestor atualiza exibicao de grupos" on public.organizations;
create policy "Gestor atualiza exibicao de grupos" on public.organizations as PERMISSIVE for UPDATE to public using ((has_role(auth.uid(), 'gestor'::app_role) AND (id = get_user_org_id())));
drop policy if exists "Membros veem a própria organização" on public.organizations;
create policy "Membros veem a própria organização" on public.organizations as PERMISSIVE for SELECT to authenticated using (((id = get_user_org_id()) OR is_platform_admin(auth.uid())));
drop policy if exists "Super admin gerencia organizações" on public.organizations;
create policy "Super admin gerencia organizações" on public.organizations as PERMISSIVE for ALL to authenticated using (is_platform_admin(auth.uid())) with check (is_platform_admin(auth.uid()));
drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles as PERMISSIVE for UPDATE to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles as PERMISSIVE for INSERT to authenticated with check (((id = auth.uid()) AND (COALESCE(is_developer, false) = false) AND (COALESCE(is_tester, false) = false)));
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles as PERMISSIVE for UPDATE to authenticated using ((id = auth.uid())) with check (((id = auth.uid()) AND (NOT (is_developer IS DISTINCT FROM ( SELECT profiles_1.is_developer
   FROM profiles profiles_1
  WHERE (profiles_1.id = auth.uid())))) AND (NOT (is_tester IS DISTINCT FROM ( SELECT profiles_1.is_tester
   FROM profiles profiles_1
  WHERE (profiles_1.id = auth.uid()))))));
drop policy if exists "Users can view own profile or staff can view all" on public.profiles;
create policy "Users can view own profile or staff can view all" on public.profiles as PERMISSIVE for SELECT to authenticated using (((auth.uid() = id) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role) OR has_role(auth.uid(), 'doutor'::app_role)));
drop policy if exists crm_managers_can_view_org_profiles on public.profiles;
create policy crm_managers_can_view_org_profiles on public.profiles as PERMISSIVE for SELECT to authenticated using (((organization_id = crm_current_org()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
drop policy if exists provider_events_select on public.provider_events;
create policy provider_events_select on public.provider_events as PERMISSIVE for SELECT to public using (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists quick_replies_tenant on public.quick_replies;
create policy quick_replies_tenant on public.quick_replies as PERMISSIVE for ALL to public using (((organization_id = crm_current_org()) AND crm_can_access())) with check (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists "Admin can manage role_permissions" on public.role_permissions;
create policy "Admin can manage role_permissions" on public.role_permissions as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'admin'::app_role));
drop policy if exists "Admins can view role_permissions" on public.role_permissions;
create policy "Admins can view role_permissions" on public.role_permissions as PERMISSIVE for SELECT to authenticated using (has_role(auth.uid(), 'admin'::app_role));
drop policy if exists tags_tenant on public.tags;
create policy tags_tenant on public.tags as PERMISSIVE for ALL to public using (((organization_id = crm_current_org()) AND crm_can_access())) with check (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists "Anyone can view theme" on public.theme_settings;
create policy "Anyone can view theme" on public.theme_settings as PERMISSIVE for SELECT to public using (true);
drop policy if exists "Devs delete theme" on public.theme_settings;
create policy "Devs delete theme" on public.theme_settings as PERMISSIVE for DELETE to authenticated using (is_dev_or_super(auth.uid()));
drop policy if exists "Devs insert theme" on public.theme_settings;
create policy "Devs insert theme" on public.theme_settings as PERMISSIVE for INSERT to authenticated with check (is_dev_or_super(auth.uid()));
drop policy if exists "Devs update theme" on public.theme_settings;
create policy "Devs update theme" on public.theme_settings as PERMISSIVE for UPDATE to authenticated using (is_dev_or_super(auth.uid())) with check (is_dev_or_super(auth.uid()));
drop policy if exists "org admins manage units" on public.units;
create policy "org admins manage units" on public.units as PERMISSIVE for ALL to public using ((((organization_id = get_user_org_id()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))) OR is_platform_admin(auth.uid())));
drop policy if exists "org members read units" on public.units;
create policy "org members read units" on public.units as PERMISSIVE for SELECT to public using (((organization_id = get_user_org_id()) OR is_platform_admin(auth.uid())));
drop policy if exists "Admins can manage roles" on public.user_roles;
create policy "Admins can manage roles" on public.user_roles as PERMISSIVE for ALL to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));
drop policy if exists "Users can view their own role" on public.user_roles;
create policy "Users can view their own role" on public.user_roles as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
drop policy if exists webhook_inbox_select on public.webhook_inbox;
create policy webhook_inbox_select on public.webhook_inbox as PERMISSIVE for SELECT to public using (((organization_id = crm_current_org()) AND crm_can_access()));
drop policy if exists wa_connections_select on public.whatsapp_connections;
create policy wa_connections_select on public.whatsapp_connections as PERMISSIVE for SELECT to authenticated using (private.crm_can_access_connection(id, false));
drop policy if exists wa_connections_write on public.whatsapp_connections;
create policy wa_connections_write on public.whatsapp_connections as PERMISSIVE for ALL to public using ((has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role)) AND (organization_id = crm_current_org())))) with check ((has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role)) AND (organization_id = crm_current_org()))));


-- 11. privilegios
--
-- Tabelas: o Supabase ja concede tudo a anon/authenticated/service_role por
-- default privilege, e a RLS e quem filtra. Fica explicito para nao depender
-- disso (e e o que producao tem, conferido em 30/10/2026).
grant usage on schema public to anon, authenticated, service_role;
grant all on table
  public.organizations,
  public.units,
  public.profiles,
  public.user_roles,
  public.organization_members,
  public.role_permissions,
  public.app_modules,
  public.app_versions,
  public.theme_settings,
  public.error_logs,
  public.listas,
  public.login_attempts,
  public.crm_installations,
  public.crm_members,
  public.whatsapp_connections,
  public.crm_connection_members,
  public.crm_contacts,
  public.conversations,
  public.messages,
  public.conversation_assignments,
  public.crm_leads,
  public.tags,
  public.contact_tags,
  public.quick_replies,
  public.internal_notes,
  public.followups,
  public.campaigns,
  public.campaign_recipients,
  public.ai_agent_settings,
  public.ai_profiles,
  public.ai_suggestions,
  public.ai_quick_responses,
  public.crm_auto_messages,
  public.crm_keepalive_state,
  public.webhook_inbox,
  public.provider_events,
  public.domain_events
to anon, authenticated, service_role;

-- Funcoes: copia exata do proacl de producao. Ponto principal: as funcoes
-- SECURITY DEFINER que recebem _org de fora (crm_ingest_message, crm_import_*,
-- crm_apply_chat_labels, crm_toggle_chat_label, crm_backfill_message,
-- crm_whatsapp_keepalive) so podem ser chamadas pela service_role -- ou seja,
-- pelas edge functions. Sem estas linhas, o Postgres da EXECUTE a PUBLIC e o
-- Supabase da a anon: qualquer um gravaria mensagem em qualquer organizacao.
-- update_updated_at_column e touch_organizations_updated_at ficam no padrao
-- (sao so de trigger, e trigger nao checa EXECUTE ao disparar).
revoke all on function private.crm_can_access_connection(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.crm_can_access_connection(uuid, boolean) to authenticated, service_role;
revoke all on function private.crm_can_access_contact(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.crm_can_access_contact(uuid, boolean) to authenticated, service_role;
revoke all on function private.crm_can_access_conversation(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.crm_can_access_conversation(uuid, boolean) to authenticated, service_role;
revoke all on function private.crm_has_any_connection_access(boolean) from public, anon, authenticated, service_role;
grant execute on function private.crm_has_any_connection_access(boolean) to authenticated, service_role;
revoke all on function private.crm_user_is_manager() from public, anon, authenticated, service_role;
grant execute on function private.crm_user_is_manager() to authenticated, service_role;
revoke all on function private_security.assign_user_role(uuid, public.app_role) from public, anon, authenticated, service_role;
grant execute on function private_security.assign_user_role(uuid, public.app_role) to PUBLIC, authenticated, service_role;
revoke all on function private_security.get_my_role() from public, anon, authenticated, service_role;
grant execute on function private_security.get_my_role() to PUBLIC, authenticated, service_role;
revoke all on function private_security.has_role(uuid, public.app_role) from public, anon, authenticated, service_role;
grant execute on function private_security.has_role(uuid, public.app_role) to PUBLIC, authenticated, service_role;
revoke all on function public.aprovar_usuario(uuid, public.app_role) from public, anon, authenticated, service_role;
grant execute on function public.aprovar_usuario(uuid, public.app_role) to authenticated, service_role;
revoke all on function public.assign_admin_to_first_user() from public, anon, authenticated, service_role;
grant execute on function public.assign_admin_to_first_user() to service_role;
revoke all on function public.assign_user_role(uuid, public.app_role) from public, anon, authenticated, service_role;
grant execute on function public.assign_user_role(uuid, public.app_role) to authenticated, service_role;
revoke all on function public.auto_confirm_new_users() from public, anon, authenticated, service_role;
grant execute on function public.auto_confirm_new_users() to service_role;
revoke all on function public.clear_login_attempts_on_pw_change() from public, anon, authenticated, service_role;
grant execute on function public.clear_login_attempts_on_pw_change() to service_role;
revoke all on function public.crm_apply_chat_labels(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crm_apply_chat_labels(uuid, jsonb) to service_role;
revoke all on function public.crm_backfill_message(uuid, uuid, text, text, text, text, text, timestamp with time zone, text) from public, anon, authenticated, service_role;
grant execute on function public.crm_backfill_message(uuid, uuid, text, text, text, text, text, timestamp with time zone, text) to service_role;
revoke all on function public.crm_can_access() from public, anon, authenticated, service_role;
grant execute on function public.crm_can_access() to PUBLIC, anon, authenticated, service_role;
revoke all on function public.crm_current_org() from public, anon, authenticated, service_role;
grant execute on function public.crm_current_org() to PUBLIC, anon, authenticated, service_role;
revoke all on function public.crm_import_chats(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crm_import_chats(uuid, uuid, jsonb) to service_role;
revoke all on function public.crm_import_contacts(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crm_import_contacts(uuid, jsonb) to service_role;
revoke all on function public.crm_import_labels(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.crm_import_labels(uuid, jsonb) to service_role;
revoke all on function public.crm_ingest_message(uuid, uuid, text, text, text, text, text, timestamp with time zone, text) from public, anon, authenticated, service_role;
grant execute on function public.crm_ingest_message(uuid, uuid, text, text, text, text, text, timestamp with time zone, text) to service_role;
revoke all on function public.crm_match_patient(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.crm_match_patient(uuid, text) to service_role;
revoke all on function public.crm_nome_de_pessoa(text) from public, anon, authenticated, service_role;
grant execute on function public.crm_nome_de_pessoa(text) to PUBLIC, anon, authenticated, service_role;
revoke all on function public.crm_normalize_phone(text) from public, anon, authenticated, service_role;
grant execute on function public.crm_normalize_phone(text) to PUBLIC, anon, authenticated, service_role;
revoke all on function public.crm_remove_whatsapp_connection(uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_remove_whatsapp_connection(uuid) to authenticated, service_role;
revoke all on function public.crm_report(timestamp with time zone, timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.crm_report(timestamp with time zone, timestamp with time zone) to service_role;
revoke all on function public.crm_report(timestamp with time zone, timestamp with time zone, uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_report(timestamp with time zone, timestamp with time zone, uuid) to authenticated, service_role;
revoke all on function public.crm_start_conversation(text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_start_conversation(text, text, uuid) to authenticated, service_role;
revoke all on function public.crm_start_conversation(text, text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_start_conversation(text, text, uuid, uuid) to authenticated, service_role;
revoke all on function public.crm_toggle_chat_label(uuid, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.crm_toggle_chat_label(uuid, text, text, boolean) to service_role;
revoke all on function public.crm_touch_updated_at() from public, anon, authenticated, service_role;
grant execute on function public.crm_touch_updated_at() to PUBLIC, anon, authenticated, service_role;
revoke all on function public.crm_validate_whatsapp_assignment() from public, anon, authenticated, service_role;
grant execute on function public.crm_validate_whatsapp_assignment() to PUBLIC, anon, authenticated, service_role;
revoke all on function public.crm_whatsapp_keepalive() from public, anon, authenticated, service_role;
grant execute on function public.crm_whatsapp_keepalive() to service_role;
revoke all on function public.get_my_role() from public, anon, authenticated, service_role;
grant execute on function public.get_my_role() to authenticated, service_role;
revoke all on function public.get_user_org_id() from public, anon, authenticated, service_role;
grant execute on function public.get_user_org_id() to PUBLIC, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated, service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
revoke all on function public.is_dev_or_super(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_dev_or_super(uuid) to authenticated, service_role;
revoke all on function public.is_org_active(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_org_active(uuid) to PUBLIC, authenticated, service_role;
revoke all on function public.is_platform_admin(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_platform_admin(uuid) to PUBLIC, authenticated, service_role;
revoke all on function public.my_organizations() from public, anon, authenticated, service_role;
grant execute on function public.my_organizations() to PUBLIC, anon, authenticated, service_role;
revoke all on function public.recusar_usuario(uuid) from public, anon, authenticated, service_role;
grant execute on function public.recusar_usuario(uuid) to authenticated, service_role;
revoke all on function public.set_active_organization(uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_active_organization(uuid) to authenticated, service_role;
revoke all on function public.set_org_id() from public, anon, authenticated, service_role;
grant execute on function public.set_org_id() to service_role;


-- 12. gatilhos de auth.users
--
-- Copiados de 20260901190000. Sem eles, alguem se cadastra e nasce sem linha em
-- profiles (handle_new_user) -- o CRM nao reconhece a pessoa. O primeiro perfil
-- criado vira admin (trigger trg_assign_admin_to_first_user em profiles, secao 8).
drop trigger if exists after_pw_change_clear_attempts on auth.users;
CREATE TRIGGER after_pw_change_clear_attempts AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION clear_login_attempts_on_pw_change();

drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

drop trigger if exists trg_auto_confirm_email on auth.users;
CREATE TRIGGER trg_auto_confirm_email BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION auto_confirm_new_users();


-- 13. storage
--
-- So os dois buckets que o CRM usa:
--   crm-media     -- midia das mensagens (evolution-webhook, crm-send-message,
--                    crm-media). Sem policy em storage.objects de proposito, igual
--                    a producao: so a service_role escreve, e o app le por URL
--                    assinada que a edge function crm-media gera.
--   whatsapp-pics -- fotos de perfil dos contatos (evolution-webhook,
--                    crm-avatars, crm-import; o app le via createSignedUrls em
--                    src/crm/services/avatars.ts). 5 policies, iguais a producao.
-- Os outros 13 buckets do VertControl (exames, fotos de paciente, recibos...)
-- sao da clinica e ficaram de fora.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-media', 'crm-media', 'f'::boolean, 18874368, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'text/csv', 'application/zip', 'application/octet-stream']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-pics', 'whatsapp-pics', 'f'::boolean, null, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Equipe ve avatares do WhatsApp da organizacao" on storage.objects;
create policy "Equipe ve avatares do WhatsApp da organizacao" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'whatsapp-pics'::text) AND ((storage.foldername(name))[1] = 'avatars'::text) AND ((storage.foldername(name))[2] = (get_user_org_id())::text)));

drop policy if exists "Staff can delete whatsapp-pics" on storage.objects;
create policy "Staff can delete whatsapp-pics" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'whatsapp-pics'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))));

drop policy if exists "Staff can update whatsapp-pics" on storage.objects;
create policy "Staff can update whatsapp-pics" on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'whatsapp-pics'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))));

drop policy if exists "Staff can upload whatsapp-pics" on storage.objects;
create policy "Staff can upload whatsapp-pics" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'whatsapp-pics'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))));

drop policy if exists "Staff can view whatsapp-pics" on storage.objects;
create policy "Staff can view whatsapp-pics" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'whatsapp-pics'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'recepcao'::app_role) OR has_role(auth.uid(), 'doutor'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))));


-- 14. realtime
--
-- Em producao, crm_contacts, conversations e messages estao na publicacao
-- supabase_realtime -- o useCrmRealtime do app escuta essas tres. O baseline nao
-- trazia isso. Protegido: se a publicacao nao existir (Postgres sem Supabase),
-- ou a tabela ja estiver nela, segue sem erro.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['crm_contacts', 'conversations', 'messages'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  else
    raise notice 'publicacao supabase_realtime nao existe: realtime do CRM nao configurado';
  end if;
end $$;


-- 15. keepalive do WhatsApp (pg_cron + pg_net)
--
-- crm_whatsapp_keepalive() (secao 7) consulta /instance/connectionState de cada
-- conexao ativa na Evolution, grava o estado em whatsapp_connections e em
-- crm_keepalive_state e pede /instance/restart quando a instancia cai. E do CRM,
-- por isso veio. Ela usa net.http_get/net.http_post: sem pg_net a funcao e
-- criada normalmente (plpgsql nao resolve isso no CREATE) e so falharia ao
-- rodar -- e ela engole o erro (exception when others then null).
--
-- O agendamento NAO roda nesta migration: so depois que as conexoes de WhatsApp
-- estiverem migradas e funcionando no projeto novo, e depois de DESLIGAR o mesmo
-- job no banco antigo (senao os dois reiniciam a mesma instancia da Evolution).
-- Em producao o job e 'crm-whatsapp-keepalive', a cada 5 minutos. Para ligar,
-- rodar no SQL Editor do projeto novo (pg_net e pg_cron habilitados em
-- Database > Extensions):
--
--   select cron.schedule(
--     'crm-whatsapp-keepalive',
--     '*/5 * * * *',
--     'select public.crm_whatsapp_keepalive()'
--   );
--
-- Para desligar: select cron.unschedule('crm-whatsapp-keepalive');
--
-- O outro job de producao, 'sincronizar-instagram', e do site, nao do CRM.
