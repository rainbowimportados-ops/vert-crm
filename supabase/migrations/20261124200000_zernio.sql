-- Zernio: WhatsApp (API oficial da Meta) e Direct do Instagram no CRM.
--
-- Cada conta conectada na Zernio vira uma linha em whatsapp_connections com
-- provider = 'zernio', o id da conta Zernio em instance_id e o canal em channel.
-- As mensagens chegam pela edge function zernio-webhook, que chama
-- crm_ingest_zernio. O id da conversa na Zernio fica em
-- conversations.provider_conversation_id e é usado para responder.
--
-- Roda lado a lado com a Evolution: conexões sem base_url/api_key não entram
-- no keepalive, e o número padrão continua o mesmo até a troca final.
-- Pode rodar de novo sem duplicar nada.

-- 1. colunas novas -----------------------------------------------------------
alter table public.whatsapp_connections add column if not exists channel text not null default 'whatsapp';
comment on column public.whatsapp_connections.channel is 'whatsapp ou instagram. Para provider = zernio, instance_id guarda o id da conta na Zernio.';

alter table public.crm_contacts add column if not exists instagram_id text;
alter table public.crm_contacts add column if not exists instagram_username text;
create unique index if not exists uq_crm_contacts_org_instagram
  on public.crm_contacts (organization_id, instagram_id) where instagram_id is not null;

alter table public.conversations add column if not exists provider_conversation_id text;
create index if not exists idx_conversations_provider_conv
  on public.conversations (connection_id, provider_conversation_id) where provider_conversation_id is not null;

-- 2. gravação de mensagem vinda da Zernio ------------------------------------
-- WhatsApp: o contato é achado pelo telefone (participantId), igual à Evolution.
-- Instagram: pelo id da pessoa no Instagram, sem telefone.
create or replace function public.crm_ingest_zernio(
  _connection uuid,
  _participant_id text,
  _participant_username text,
  _participant_name text,
  _direction text,
  _content text,
  _provider_msg_id text,
  _msg_at timestamptz,
  _type text,
  _provider_conv_id text,
  _media_url text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_install uuid; v_assignee uuid; v_sector text; v_channel text;
  v_contact uuid; v_conv uuid; v_msg uuid; v_name text; v_norm text;
  v_new_contact boolean := false;
begin
  select organization_id, installation_id, default_assignee_id, sector, channel
    into v_org, v_install, v_assignee, v_sector, v_channel
  from public.whatsapp_connections
  where id = _connection and provider = 'zernio' and is_active;
  if v_org is null then raise exception 'conexao Zernio invalida'; end if;
  if coalesce(_participant_id, '') = '' then return null; end if;

  v_name := case when _direction = 'in' then public.crm_nome_de_pessoa(_participant_name) else null end;

  if v_channel = 'instagram' then
    select id into v_contact from public.crm_contacts
    where organization_id = v_org and instagram_id = _participant_id and deleted_at is null limit 1;
    if v_contact is null then
      insert into public.crm_contacts (organization_id, installation_id, name, instagram_id, instagram_username)
      values (v_org, v_install,
              coalesce(v_name, nullif(_participant_username, ''), 'Instagram'),
              _participant_id, nullif(ltrim(_participant_username, '@'), ''))
      returning id into v_contact;
      v_new_contact := true;
    else
      update public.crm_contacts
      set instagram_username = coalesce(nullif(ltrim(_participant_username, '@'), ''), instagram_username),
          name = case when v_name is not null and (name is null or name = 'Instagram' or name = instagram_username)
                      then v_name else name end
      where id = v_contact;
    end if;
  else
    v_norm := public.crm_normalize_phone(_participant_id);
    if v_norm is null or v_norm = '' then return null; end if;
    select id into v_contact from public.crm_contacts
    where organization_id = v_org and phone_normalized = v_norm and deleted_at is null limit 1;
    if v_contact is null then
      insert into public.crm_contacts (organization_id, installation_id, name, phone)
      values (v_org, v_install, coalesce(v_name, _participant_id), _participant_id)
      returning id into v_contact;
      v_new_contact := true;
    else
      update public.crm_contacts
      set name = case when v_name is not null and (name is null or name = phone or name = phone_normalized)
                      then v_name else name end
      where id = v_contact;
    end if;
  end if;

  select id into v_conv from public.conversations
  where organization_id = v_org and contact_id = v_contact and connection_id = _connection
  order by last_message_at desc nulls last limit 1;

  if v_conv is null then
    insert into public.conversations (
      organization_id, installation_id, connection_id, contact_id, status,
      is_new_lead, assignee_id, routing_sector, provider_conversation_id
    ) values (v_org, v_install, _connection, v_contact, 'novo', false, v_assignee, v_sector, _provider_conv_id)
    returning id into v_conv;
  else
    update public.conversations
    set provider_conversation_id = coalesce(_provider_conv_id, provider_conversation_id),
        status = case when _direction = 'in' and status = 'finalizado' then 'novo' else status end,
        assignee_id = case when _direction = 'in' then coalesce(assignee_id, v_assignee) else assignee_id end,
        routing_sector = coalesce(routing_sector, v_sector)
    where id = v_conv;
  end if;

  insert into public.messages (
    organization_id, conversation_id, direction, type, content, media_url,
    provider_message_id, delivery_status, message_at
  ) values (
    v_org, v_conv, _direction, coalesce(nullif(_type, ''), 'text'), _content, _media_url,
    _provider_msg_id, case when _direction = 'in' then 'read' else 'sent' end,
    coalesce(_msg_at, now())
  )
  on conflict (organization_id, provider_message_id) where provider_message_id is not null
  do nothing returning id into v_msg;

  if v_msg is null then return null; end if;

  update public.conversations
  set last_message_preview = left(coalesce(nullif(_content, ''), case coalesce(_type, 'text')
        when 'image' then 'Imagem' when 'video' then 'Vídeo' when 'audio' then 'Áudio'
        when 'document' then 'Documento' else '' end), 120),
      last_message_at = greatest(coalesce(last_message_at, coalesce(_msg_at, now())), coalesce(_msg_at, now())),
      unread_count = case when _direction = 'in' then unread_count + 1 else unread_count end,
      updated_at = now()
  where id = v_conv;

  insert into public.domain_events (organization_id, event_type, conversation_id, contact_id, payload)
  values (
    v_org, case when _direction = 'in' then 'message.received' else 'message.sent' end,
    v_conv, v_contact,
    jsonb_build_object('messageId', v_msg, 'direction', _direction, 'content', _content,
      'channel', v_channel, 'connectionId', _connection, 'newContact', v_new_contact, 'provider', 'zernio')
  );
  return v_msg;
end;
$$;

-- 3. status de entrega (sent / delivered / read / failed) --------------------
create or replace function public.crm_zernio_status(
  _org uuid, _provider_msg_id text, _status text, _error text default null
) returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.messages
  set delivery_status = _status,
      delivery_error = case when _status = 'failed' then left(_error, 600) else delivery_error end
  where organization_id = _org
    and provider_message_id = _provider_msg_id
    and direction = 'out'
    -- não volta de 'read' para 'delivered' quando os avisos chegam fora de ordem
    and not (delivery_status = 'read' and _status in ('sent', 'delivered'));
$$;

revoke all on function public.crm_ingest_zernio(uuid, text, text, text, text, text, text, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.crm_zernio_status(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_ingest_zernio(uuid, text, text, text, text, text, text, timestamptz, text, text, text) to service_role;
grant execute on function public.crm_zernio_status(uuid, text, text, text) to service_role;
