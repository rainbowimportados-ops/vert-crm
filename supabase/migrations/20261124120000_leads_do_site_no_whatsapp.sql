-- Leads do site (landing e cartão digital) entram no CRM com conversa aberta.
--
-- site_capturar_lead grava o lead sem connection_id. Como o RLS de crm_leads
-- filtra por número de WhatsApp, esses leads ficavam invisíveis no CRM.
-- Agora todo lead sem número vai para o WhatsApp padrão da organização e ganha
-- uma conversa nesse número, no topo da fila, para o vendedor chamar.
--
-- Não altera site_capturar_lead: tudo acontece nos gatilhos abaixo.
-- Pode rodar de novo sem duplicar nada.

-- 1. lead sem número -> WhatsApp padrão (ativo) da organização
create or replace function private.crm_lead_numero_padrao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.connection_id is null then
    select id into new.connection_id
    from public.whatsapp_connections
    where organization_id = new.organization_id and is_active
    order by is_default desc, created_at asc
    limit 1;
  end if;
  return new;
end;
$$;

-- 2. lead com contato e número -> garante a conversa nesse número
create or replace function private.crm_lead_abre_conversa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _install uuid; _assignee uuid; _sector text; _conv uuid; _aviso text;
begin
  if new.contact_id is null or new.connection_id is null then
    return new;
  end if;

  select installation_id, default_assignee_id, sector
  into _install, _assignee, _sector
  from public.whatsapp_connections where id = new.connection_id;

  _aviso := case new.source_surface
    when 'landing' then 'Novo lead da landing page'
    when 'digital_card' then 'Novo lead do cartão digital'
    else 'Novo lead' end
    || coalesce(' · ' || nullif(new.intent, ''), '');

  select id into _conv from public.conversations
  where organization_id = new.organization_id
    and contact_id = new.contact_id
    and connection_id = new.connection_id
  limit 1;

  if _conv is null then
    insert into public.conversations (
      organization_id, installation_id, contact_id, connection_id, status,
      is_new_lead, assignee_id, routing_sector, unread_count,
      last_message_preview, last_message_at
    ) values (
      new.organization_id, _install, new.contact_id, new.connection_id, 'novo',
      true, _assignee, _sector, 1, _aviso, new.created_at
    );
  elsif tg_op = 'INSERT' and new.source like 'site:%' then
    -- contato que já conversava e mandou formulário de novo pelo site:
    -- sobe para o topo da fila como não lida. Lead criado dentro do CRM não mexe.
    update public.conversations
    set is_new_lead = true,
        unread_count = unread_count + 1,
        last_message_preview = _aviso,
        last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
        status = case when status = 'finalizado' then 'novo' else status end
    where id = _conv;
  end if;
  return new;
end;
$$;

revoke all on function private.crm_lead_numero_padrao() from public, anon, authenticated;
revoke all on function private.crm_lead_abre_conversa() from public, anon, authenticated;

drop trigger if exists trg_crm_leads_numero_padrao on public.crm_leads;
create trigger trg_crm_leads_numero_padrao
  before insert or update of connection_id on public.crm_leads
  for each row execute function private.crm_lead_numero_padrao();

drop trigger if exists trg_crm_leads_abre_conversa on public.crm_leads;
create trigger trg_crm_leads_abre_conversa
  after insert or update of connection_id on public.crm_leads
  for each row execute function private.crm_lead_abre_conversa();

-- 3. leads que já entraram sem número. O update dispara os dois gatilhos:
--    o BEFORE escolhe o número padrão e o AFTER abre a conversa que faltar
--    (com a data do lead, sem bagunçar a ordem da fila).
update public.crm_leads set connection_id = null where connection_id is null;
