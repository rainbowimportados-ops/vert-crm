-- Quem pode ver um lead pode ver o contato dele.
-- Antes o contato só aparecia se houvesse conversa num número que a pessoa
-- acessa; os leads do site cuja conversa ficou na conexão antiga apareciam
-- como "Lead · Sem telefone" na tela Leads.
create or replace function private.crm_can_access_contact(_contact uuid, _write boolean default false)
 returns boolean
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select exists (
    select 1 from public.conversations c
    where c.contact_id = _contact
      and c.organization_id = public.crm_current_org()
      and private.crm_can_access_connection(c.connection_id, _write)
  ) or exists (
    select 1 from public.crm_leads l
    where l.contact_id = _contact
      and l.organization_id = public.crm_current_org()
      and private.crm_can_access_connection(l.connection_id, _write)
  );
$function$;
