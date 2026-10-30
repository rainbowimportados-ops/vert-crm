-- Smoke test do schema do CRM.
--
-- Roda num banco local onde ja foram aplicados, nesta ordem:
--   supabase/tests/stubs_supabase_local.sql
--   supabase/migrations/20261030120000_schema_do_crm.sql
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke_crm.sql
--
-- Tudo dentro de uma transacao que termina em ROLLBACK: nao deixa dado.
-- Qualquer verificacao que falhar levanta excecao e o psql para (ON_ERROR_STOP).
-- NUNCA rodar em banco de producao.

begin;

-- 1. organizacao + instalacao do CRM + conexao de WhatsApp ----------------------
insert into public.organizations (id, name, slug, status)
values ('11111111-1111-1111-1111-111111111111', 'Clinica Teste', 'clinica-teste', 'active');

insert into public.crm_installations (id, organization_id, key, name)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'crm', 'CRM');

insert into public.whatsapp_connections (id, organization_id, installation_id, instance_name, display_name, is_default)
values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'teste', 'Recepcao', true);

-- 2. uma mensagem recebida e uma enviada, pelo caminho do evolution-webhook -----
select public.crm_ingest_message(
  '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
  '+55 (16) 99999-0001', 'Maria Souza', 'in', 'Oi, quero marcar uma avaliacao',
  'WAMSG-IN-1', now() - interval '1 minute', 'text') as msg_in;

select public.crm_ingest_message(
  '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
  '5516999990001', null, 'out', 'Claro! Qual o melhor horario?',
  'WAMSG-OUT-1', now(), 'text') as msg_out;

-- reentrega do mesmo id do provedor: nao duplica
select public.crm_ingest_message(
  '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
  '5516999990001', 'Maria Souza', 'in', 'Oi, quero marcar uma avaliacao',
  'WAMSG-IN-1', now(), 'text') as msg_dup;

do $$
declare n_contacts int; n_convs int; n_msgs int; n_events int; c record;
begin
  select count(*) into n_contacts from public.crm_contacts;
  select count(*) into n_convs from public.conversations;
  select count(*) into n_msgs from public.messages;
  select count(*) into n_events from public.domain_events;
  if n_contacts <> 1 then raise exception 'esperava 1 crm_contacts, veio %', n_contacts; end if;
  if n_convs <> 1 then raise exception 'esperava 1 conversations, veio %', n_convs; end if;
  if n_msgs <> 2 then raise exception 'esperava 2 messages, veio %', n_msgs; end if;
  if n_events <> 2 then raise exception 'esperava 2 domain_events, veio %', n_events; end if;

  select ct.name, ct.phone_normalized, ct.patient_id, cv.unread_count, cv.last_message_preview
    into c
  from public.crm_contacts ct join public.conversations cv on cv.contact_id = ct.id;
  if c.phone_normalized <> '16999990001' then raise exception 'telefone normalizado errado: %', c.phone_normalized; end if;
  if c.name <> 'Maria Souza' then raise exception 'nome do contato errado: %', c.name; end if;
  if c.patient_id is not null then raise exception 'crm_match_patient deveria devolver null'; end if;
  if c.unread_count <> 1 then raise exception 'unread_count deveria ser 1, veio %', c.unread_count; end if;
  if c.last_message_preview <> 'Claro! Qual o melhor horario?' then raise exception 'preview errado: %', c.last_message_preview; end if;
  raise notice 'OK ingest: 1 contato, 1 conversa, 2 mensagens, 2 eventos';
end $$;

-- 3. importacao de contatos (funcao reescrita sem patients) ---------------------
do $$
declare n int;
begin
  n := public.crm_import_contacts('11111111-1111-1111-1111-111111111111',
        '[{"phone":"5516999990002","name":"Joao"},{"phone":"5516999990001","name":"Maria"}]'::jsonb);
  if (select count(*) from public.crm_contacts) <> 2 then raise exception 'crm_import_contacts nao criou o contato novo'; end if;
  raise notice 'OK crm_import_contacts: % linha(s) afetada(s)', n;
end $$;

-- 3.1 demais RPCs das edge functions: so precisam rodar sem erro de tabela
-- ausente (plpgsql so resolve tabela na hora da chamada) ------------------------
do $$
declare v_org uuid := '11111111-1111-1111-1111-111111111111';
        v_con uuid := '33333333-3333-3333-3333-333333333333';
begin
  perform public.crm_import_chats(v_org, v_con,
    '[{"phone":"5516999990004","name":"Carla","jid":"5516999990004@s.whatsapp.net","last_message":"ola","last_at":"2026-10-30T10:00:00Z"}]'::jsonb);
  perform public.crm_import_labels(v_org, '[{"external_id":"1","label":"Novo cliente","color":"#22c55e"}]'::jsonb);
  perform public.crm_apply_chat_labels(v_org, '[{"phone":"5516999990004","labels":["1"]}]'::jsonb);
  perform public.crm_toggle_chat_label(v_org, '5516999990004', '1', false);
  perform public.crm_backfill_message(v_org, v_con, '5516999990004', 'Carla', 'in', 'mensagem antiga',
    'WAMSG-OLD-1', now() - interval '30 days', 'text');
  perform public.crm_whatsapp_keepalive();   -- sem pg_net: engole o erro, nao derruba
  if (select count(*) from public.crm_contacts where phone_normalized = '16999990004') <> 1 then
    raise exception 'crm_import_chats nao criou o contato';
  end if;
  if not exists (select 1 from public.tags where external_id = '1') then
    raise exception 'crm_import_labels nao criou a etiqueta';
  end if;
  raise notice 'OK RPCs de importacao, etiquetas, backfill e keepalive';
end $$;

-- 4. cadastro em auth.users gera profile e o primeiro vira admin ----------------
insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-4444-4444-4444-444444444444', 'gestor@teste.local', '{"full_name":"Gestor Teste"}');
update public.profiles set organization_id = '11111111-1111-1111-1111-111111111111'
where id = '44444444-4444-4444-4444-444444444444';

do $$
begin
  if not exists (select 1 from public.profiles where id = '44444444-4444-4444-4444-444444444444') then
    raise exception 'handle_new_user nao criou o profile';
  end if;
  if not exists (select 1 from public.user_roles where user_id = '44444444-4444-4444-4444-444444444444' and role = 'admin') then
    raise exception 'assign_admin_to_first_user nao deu admin ao primeiro usuario';
  end if;
  raise notice 'OK auth: profile criado e papel admin atribuido';
end $$;

-- 5. RLS e RPCs como usuario logado ---------------------------------------------
-- totais vistos pelo superusuario; o admin da organizacao tem que ver o mesmo
create temp table _esperado on commit drop as
  select (select count(*) from public.conversations) as convs,
         (select count(*) from public.messages) as msgs;
grant select on _esperado to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

do $$
declare n int; r jsonb;
begin
  select count(*) into n from public.conversations;
  if n <> (select convs from _esperado) or n = 0 then raise exception 'RLS: admin da organizacao viu % conversas', n; end if;
  select count(*) into n from public.messages;
  if n <> (select msgs from _esperado) or n = 0 then raise exception 'RLS: admin da organizacao viu % mensagens', n; end if;
  select count(*) into n from public.my_organizations();
  if n <> 1 then raise exception 'my_organizations deveria devolver 1, veio %', n; end if;
  r := public.crm_report(now() - interval '1 day', now() + interval '1 minute', '33333333-3333-3333-3333-333333333333');
  if (r->>'conversations_total')::int <> (select convs from _esperado) then raise exception 'crm_report: conversations_total errado: %', r; end if;
  perform public.crm_start_conversation('5516999990003', 'Ana', null, '33333333-3333-3333-3333-333333333333');
  raise notice 'OK authenticated: RLS, my_organizations, crm_report, crm_start_conversation';
end $$;

-- authenticated NAO pode chamar a ingestao direto (so service_role)
do $$
begin
  begin
    perform public.crm_ingest_message('11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333', '5516999990009', 'x', 'in', 'x', 'X-1', now(), 'text');
    raise exception 'authenticated conseguiu chamar crm_ingest_message';
  exception when insufficient_privilege then
    raise notice 'OK grant: authenticated bloqueado em crm_ingest_message';
  end;
end $$;

reset role;

-- anonimo nao ve nada
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.messages;
  if n <> 0 then raise exception 'anon viu % mensagens', n; end if;
  raise notice 'OK anon: 0 mensagens visiveis';
end $$;
reset role;

rollback;
