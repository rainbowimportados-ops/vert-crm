-- Segredo do webhook da Zernio guardado no Vault: a edge function zernio-webhook
-- lê por esta função (só service_role) quando ZERNIO_WEBHOOK_SECRET não confere.
-- O valor entra no Vault fora das migrações:
--   select vault.create_secret('<segredo do webhook na Zernio>', 'zernio_webhook_secret');
create or replace function public.crm_zernio_webhook_secret()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'zernio_webhook_secret' limit 1;
$$;

revoke all on function public.crm_zernio_webhook_secret() from public, anon, authenticated;
grant execute on function public.crm_zernio_webhook_secret() to service_role;
