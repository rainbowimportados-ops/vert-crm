-- Stubs do que o Supabase ja entrega pronto num projeto novo.
--
-- NAO faz parte da migration. Serve so para validar
-- supabase/migrations/20261030120000_schema_do_crm.sql num Postgres 16 puro
-- (sem a imagem do Supabase). Rodar uma vez, num banco vazio, antes da migration:
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/stubs_supabase_local.sql
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261030120000_schema_do_crm.sql
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke_crm.sql
--
-- O que fica de fora de proposito:
--   * pg_net e pg_cron nao existem no Postgres puro. A migration testa se elas
--     existem antes de usa-las; aqui elas simplesmente nao sao instaladas.
--   * supabase_vault e pg_stat_statements idem (a migration nao depende delas).
--   * A publicacao supabase_realtime e criada vazia aqui, para exercitar o
--     trecho da migration que adiciona as tabelas do CRM a ela.

-- papeis -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin login superuser;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then
    create role dashboard_user nologin;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- schema extensions ----------------------------------------------------------
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- o Supabase deixa extensions no search_path de todo mundo
do $$ begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end $$;

-- auth -----------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  confirmed_at timestamptz,
  encrypted_password text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- auth.uid()/auth.role()/auth.jwt() leem as configuracoes da requisicao, como no
-- Supabase. No teste: set request.jwt.claim.sub = '<uuid>'.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.role', true),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'role')), '')::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

-- storage --------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text) returns text
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- realtime -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- privilegios padrao do schema public (o Supabase concede isso por padrao) ----
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
