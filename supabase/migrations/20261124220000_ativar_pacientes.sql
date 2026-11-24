-- "Ativar pacientes": quadro de follow-up montado a partir das conversas.
--
-- crm_ativacao_lista devolve, para cada conversa do número com movimento nos
-- últimos 120 dias, quem falou por último e quando, a última mensagem do
-- paciente (para a janela de 24 h do WhatsApp oficial) e se a última mensagem
-- da clínica fala de manutenção. A separação nas gavetas é feita no app.
--
-- security invoker: o RLS de conversations/messages vale para quem chama,
-- então cada atendente só vê os números que já pode ver.

alter table public.conversations add column if not exists ativacao_resolvida_em timestamptz;
comment on column public.conversations.ativacao_resolvida_em is
  'Quando a ficha foi marcada como resolvida no quadro Ativar pacientes. Volta a aparecer se chegar mensagem nova depois disso.';

create index if not exists idx_messages_conv_dir_at
  on public.messages (conversation_id, direction, message_at desc);

create or replace function public.crm_ativacao_lista(_connection uuid)
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
  resolvida_em timestamptz
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
    c.ativacao_resolvida_em
  from public.conversations c
  join public.crm_contacts ct on ct.id = c.contact_id
  cross join lateral (
    select m.direction, m.message_at, m.content from public.messages m
    where m.conversation_id = c.id order by m.message_at desc limit 1
  ) ult
  left join lateral (
    select m.message_at from public.messages m
    where m.conversation_id = c.id and m.direction = 'in' order by m.message_at desc limit 1
  ) ent on true
  left join lateral (
    select m.message_at, m.content from public.messages m
    where m.conversation_id = c.id and m.direction = 'out' order by m.message_at desc limit 1
  ) sai on true
  where c.connection_id = _connection
    and c.last_message_at > now() - interval '120 days'
    and ct.deleted_at is null;
$$;

revoke all on function public.crm_ativacao_lista(uuid) from public, anon;
grant execute on function public.crm_ativacao_lista(uuid) to authenticated, service_role;
