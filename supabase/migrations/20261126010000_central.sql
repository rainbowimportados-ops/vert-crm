-- Central Organizadora (tela inicial do CRM), etapas 1 e 2:
-- responsável automático, transcrição de áudio, compromissos (o que a clínica
-- prometeu e retornos pedidos pelo paciente) e a função que monta a tela.

-- 1) Transcrição de áudio (feita quando alguém clica em "Transcrever").
alter table public.messages add column if not exists transcricao text;

-- 2) Responsável = quem respondeu por último pelo CRM.
create or replace function public.crm_dono_ultima_resposta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.direction = 'out' and new.sender_user_id is not null then
    update public.conversations
       set assignee_id = new.sender_user_id
     where id = new.conversation_id
       and assignee_id is distinct from new.sender_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_dono_ultima_resposta on public.messages;
create trigger crm_dono_ultima_resposta
  after insert on public.messages
  for each row execute function public.crm_dono_ultima_resposta();

-- conversas antigas: dono = autor da última resposta registrada
update public.conversations c
   set assignee_id = u.sender_user_id
  from (
    select distinct on (m.conversation_id) m.conversation_id, m.sender_user_id
      from public.messages m
     where m.direction = 'out' and m.sender_user_id is not null
     order by m.conversation_id, m.message_at desc
  ) u
 where u.conversation_id = c.id and c.assignee_id is null;

-- 3) Compromissos: promessas da clínica e retornos pedidos pelo paciente.
create table if not exists public.crm_compromissos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid,
  tipo text not null check (tipo in ('promessa', 'retorno')),
  texto text not null,
  prazo date,
  responsavel_id uuid,
  status text not null default 'aberto' check (status in ('aberto', 'feito', 'descartado')),
  origem_message_id uuid,
  origem_em timestamptz,
  concluido_em timestamptz,
  concluido_por text check (concluido_por in ('auto', 'manual')),
  evidencia text,
  created_at timestamptz not null default now()
);
create index if not exists crm_compromissos_abertos on public.crm_compromissos (organization_id, status, prazo);
create index if not exists crm_compromissos_conversa on public.crm_compromissos (conversation_id, status);

alter table public.crm_compromissos enable row level security;
drop policy if exists "ver compromisso de conversa visivel" on public.crm_compromissos;
create policy "ver compromisso de conversa visivel" on public.crm_compromissos
  for select using (exists (select 1 from public.conversations c where c.id = crm_compromissos.conversation_id));
drop policy if exists "concluir compromisso de conversa visivel" on public.crm_compromissos;
create policy "concluir compromisso de conversa visivel" on public.crm_compromissos
  for update using (exists (select 1 from public.conversations c where c.id = crm_compromissos.conversation_id))
  with check (exists (select 1 from public.conversations c where c.id = crm_compromissos.conversation_id));
grant select, update on public.crm_compromissos to authenticated;

-- 4) Até onde o Claude já leu cada conversa.
create table if not exists public.crm_central_estado (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  analisado_ate timestamptz not null,
  analisado_em timestamptz not null default now()
);
alter table public.crm_central_estado enable row level security;

-- Fila da leitura: conversas com mensagem nova nos últimos 7 dias.
create or replace function public.crm_central_pendentes(_org uuid, _limite int default 12)
returns table(conversation_id uuid, desde timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, coalesce(e.analisado_ate, now() - interval '7 days')
  from public.conversations c
  left join public.crm_central_estado e on e.conversation_id = c.id
  where (_org is null or c.organization_id = _org)
    and c.last_message_at > now() - interval '7 days'
    and (e.analisado_ate is null or c.last_message_at > e.analisado_ate)
  order by c.last_message_at desc
  limit greatest(1, least(_limite, 40));
$$;
revoke all on function public.crm_central_pendentes(uuid, int) from public, anon, authenticated;

-- 5) Tela da Central (com o login de quem vê: RLS).
create or replace function public.crm_central()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with conv as (
    select
      c.id, c.connection_id, c.contact_id, c.assignee_id, c.unread_count,
      ct.name as nome, ct.phone as telefone,
      ult.direction as ult_dir, ult.message_at as ult_em,
      left(coalesce(nullif(ult.content, ''), ult.transcricao, case when ult.type <> 'text' then '[' || ult.type || ']' end, ''), 160) as ult_texto,
      coalesce(sai.content ~* 'manuten', false) and (ent.message_at is null or ent.message_at < sai.message_at) as manut,
      c.ativacao_resolvida_em is not null and c.ativacao_resolvida_em >= ult.message_at as resolvida,
      sai.message_at as sai_em,
      r.resumo, r.proximo, r.valor,
      public.crm_origem_lead(ld.source, coalesce(ld.utm, '{}'::jsonb), w.channel) as origem,
      w.display_name as caixa
    from public.conversations c
    join public.whatsapp_connections w on w.id = c.connection_id and coalesce(w.is_active, true)
    join public.crm_contacts ct on ct.id = c.contact_id and ct.deleted_at is null
    cross join lateral (
      select m.direction, m.message_at, m.content, m.transcricao, m.type from public.messages m
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
    left join lateral (
      select l.source, l.utm from public.crm_leads l
      where l.contact_id = ct.id order by l.created_at desc limit 1
    ) ld on true
    left join public.crm_ativacao_resumos r on r.conversation_id = c.id
    where c.last_message_at > now() - interval '120 days'
  ),
  gav as (
    select *,
      case
        when resolvida then null
        when manut then 'manut'
        when ult_dir = 'in' and ult_em > now() - interval '4 days' then 'hoje'
        when ult_dir = 'in' then 'retomar'
        when ult_em > now() - interval '30 days' then 'ativar'
      end as gaveta
    from conv
  ),
  comp as (
    select k.*, g.nome, g.connection_id, g.telefone
    from public.crm_compromissos k
    join gav g on g.id = k.conversation_id
    where k.status = 'aberto'
  ),
  equipe as (
    select p.id, coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)) as nome
    from public.profiles p
    where p.organization_id = public.crm_current_org()
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'whatsapp_lido_em', (select max(ult_em) from gav),
    'totais', jsonb_build_object(
      'responder', (select count(*) from gav where gaveta in ('hoje', 'retomar')),
      'retomar', (select count(*) from gav where gaveta = 'retomar'),
      'ativar', (select count(*) from gav where gaveta = 'ativar'),
      'promessas', (select count(*) from comp where tipo = 'promessa'),
      'promessas_vencidas', (select count(*) from comp where tipo = 'promessa' and prazo < current_date),
      'retornos', (select count(*) from comp where tipo = 'retorno'),
      'retornos_hoje', (select count(*) from comp where tipo = 'retorno' and prazo <= current_date),
      'sem_dono', (select count(*) from gav where assignee_id is null and ult_dir = 'in' and ult_em > now() - interval '14 days' and sai_em is null)
    ),
    'prioridade', coalesce((select jsonb_agg(x order by x.ordem, x.ult_em) from (
        select g.id as conversation_id, g.connection_id, g.contact_id, g.nome, g.telefone, g.gaveta, g.ult_em, g.ult_texto,
               g.resumo, g.proximo, g.valor, g.assignee_id, g.caixa,
               exists (select 1 from comp k where k.conversation_id = g.id) as tem_compromisso,
               case g.gaveta when 'retomar' then 1 else 2 end as ordem
        from gav g where g.gaveta in ('hoje', 'retomar')
        order by case g.gaveta when 'retomar' then 1 else 2 end, g.ult_em
        limit 60
      ) x), '[]'::jsonb),
    'sem_dono', coalesce((select jsonb_agg(x order by x.ult_em) from (
        select g.id as conversation_id, g.connection_id, g.contact_id, g.nome, g.telefone, g.ult_em, g.ult_texto, g.origem, g.caixa
        from gav g
        where g.assignee_id is null and g.ult_dir = 'in' and g.ult_em > now() - interval '14 days' and g.sai_em is null
        order by g.ult_em limit 60
      ) x), '[]'::jsonb),
    'compromissos', coalesce((select jsonb_agg(x order by x.prazo nulls last, x.origem_em) from (
        select k.id, k.tipo, k.texto, k.prazo, k.origem_em, k.responsavel_id, k.conversation_id, k.connection_id,
               k.contact_id, k.nome, k.telefone
        from comp k order by k.prazo nulls last, k.origem_em limit 200
      ) x), '[]'::jsonb),
    'equipe', coalesce((select jsonb_agg(x order by x.pendentes desc, x.nome) from (
        select e.id, e.nome,
               (select count(*) from gav g where g.assignee_id = e.id and g.gaveta in ('hoje', 'retomar')) as pendentes,
               (select count(*) from comp k where k.responsavel_id = e.id) as compromissos
        from equipe e
      ) x where x.pendentes + x.compromissos > 0), '[]'::jsonb)
  );
$$;
grant execute on function public.crm_central() to authenticated;

-- 6) Sem agendamento no servidor: a leitura roda enquanto alguém está com o
-- CRM aberto (ao entrar e a cada 3 min com a aba visível), pela edge function
-- crm-central com o login de quem está usando.
