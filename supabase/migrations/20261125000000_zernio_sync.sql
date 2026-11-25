-- Sincronização com a Zernio (edge function zernio-sync).
--
-- O tempo real vem do zernio-webhook. A zernio-sync roda a cada 5 minutos pelo
-- pg_cron e pega o que um webhook perdido deixou para trás; à mão, com
-- {"modo":"historico","dias":N}, traz as conversas antigas.
--
-- O acesso é por um token no Vault (zernio_sync_token), criado fora das
-- migrações:
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'zernio_sync_token');

create or replace function public.crm_zernio_sync_token()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'zernio_sync_token' limit 1;
$$;

revoke all on function public.crm_zernio_sync_token() from public, anon, authenticated;
grant execute on function public.crm_zernio_sync_token() to service_role;

-- Depois de importar histórico: "não lidas" = mensagens do paciente depois da
-- última resposta da clínica (a importação somaria todas as recebidas).
create or replace function public.crm_recalcula_nao_lidas(_conversas uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.conversations c
  set unread_count = least(99, (
    select count(*) from public.messages m
    where m.conversation_id = c.id and m.direction = 'in'
      and m.message_at > coalesce((
        select max(o.message_at) from public.messages o
        where o.conversation_id = c.id and o.direction = 'out'
      ), '-infinity'::timestamptz)
  ))
  where c.id = any(_conversas);
$$;

revoke all on function public.crm_recalcula_nao_lidas(uuid[]) from public, anon, authenticated;
grant execute on function public.crm_recalcula_nao_lidas(uuid[]) to service_role;

-- A cada 5 minutos: conversas mexidas nos últimos 30 minutos.
select cron.unschedule('zernio-sync') where exists (select 1 from cron.job where jobname = 'zernio-sync');
select cron.schedule(
  'zernio-sync',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/zernio-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'zernio_sync_token')
    ),
    body := jsonb_build_object('modo', 'recente', 'minutos', 30),
    timeout_milliseconds := 120000
  );
  $job$
);
