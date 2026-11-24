-- WhatsApp oficial pelo Zernio, ao lado da Evolution API.
--
-- Uma conexão com provider = 'zernio' não usa base_url/api_key/instance_name:
-- ela aponta para a conta do WhatsApp no Zernio (zernio_account_id).
-- As conexões da Evolution continuam funcionando sem mudança.

alter table public.whatsapp_connections
  add column if not exists zernio_account_id text;

create unique index if not exists uq_whatsapp_connections_zernio_account
  on public.whatsapp_connections (zernio_account_id)
  where zernio_account_id is not null;

-- Id da conversa no provedor (no Zernio, o envio é por conversa, não por telefone).
alter table public.conversations
  add column if not exists provider_conversation_id text;

create index if not exists idx_conversations_provider_conversation
  on public.conversations (provider_conversation_id)
  where provider_conversation_id is not null;
