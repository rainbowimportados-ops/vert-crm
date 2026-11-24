-- "Ativar pacientes": resumo e próximo passo em cada cartão, e etiquetas.
--
-- crm_ativacao_resumos guarda o que o Claude escreveu para cada conversa e a
-- data da última mensagem que ele leu (base_msg_em). Mensagem nova deixa o
-- resumo velho e o app pede outro. Só a edge function crm-ativacao grava
-- (service_role); quem pode ver a conversa pode ler o resumo.
--
-- crm_ativacao_lista passa a devolver o resumo e os dados das etiquetas:
-- etapa do lead, se o paciente mandou áudio depois da última resposta da
-- clínica e o último texto do paciente (para sinais de risco de perda).

create table if not exists public.crm_ativacao_resumos (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  organization_id uuid not null,
  resumo text not null,
  proximo text not null,
  etiquetas text[] not null default '{}',
  valor text,
  base_msg_em timestamptz not null,
  gerado_em timestamptz not null default now()
);

alter table public.crm_ativacao_resumos enable row level security;

drop policy if exists "ver resumo de conversa visivel" on public.crm_ativacao_resumos;
create policy "ver resumo de conversa visivel" on public.crm_ativacao_resumos
  for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));

revoke all on public.crm_ativacao_resumos from anon;
grant select on public.crm_ativacao_resumos to authenticated;
grant all on public.crm_ativacao_resumos to service_role;

drop function if exists public.crm_ativacao_lista(uuid);

create function public.crm_ativacao_lista(_connection uuid)
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
  resolvida_em timestamptz,
  texto_paciente text,
  audio_sem_resposta boolean,
  lead_etapa text,
  lead_origem text,
  resumo text,
  proximo text,
  etiquetas text[],
  valor text,
  resumo_base_em timestamptz
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
    c.ativacao_resolvida_em,
    left(coalesce(ent.content, ''), 280),
    exists (
      select 1 from public.messages a
      where a.conversation_id = c.id and a.direction = 'in' and a.type = 'audio'
        and (sai.message_at is null or a.message_at > sai.message_at)
    ),
    ld.status, ld.source,
    r.resumo, r.proximo, r.etiquetas, r.valor, r.base_msg_em
  from public.conversations c
  join public.crm_contacts ct on ct.id = c.contact_id
  cross join lateral (
    select m.direction, m.message_at, m.content from public.messages m
    where m.conversation_id = c.id order by m.message_at desc limit 1
  ) ult
  left join lateral (
    select m.message_at, m.content from public.messages m
    where m.conversation_id = c.id and m.direction = 'in' order by m.message_at desc limit 1
  ) ent on true
  left join lateral (
    select m.message_at, m.content from public.messages m
    where m.conversation_id = c.id and m.direction = 'out' order by m.message_at desc limit 1
  ) sai on true
  left join lateral (
    select l.status, l.source from public.crm_leads l
    where l.contact_id = ct.id and (l.connection_id = c.connection_id or l.connection_id is null)
    order by l.created_at desc limit 1
  ) ld on true
  left join public.crm_ativacao_resumos r on r.conversation_id = c.id
  where c.connection_id = _connection
    and c.last_message_at > now() - interval '120 days'
    and ct.deleted_at is null;
$$;

revoke all on function public.crm_ativacao_lista(uuid) from public, anon;
grant execute on function public.crm_ativacao_lista(uuid) to authenticated, service_role;
