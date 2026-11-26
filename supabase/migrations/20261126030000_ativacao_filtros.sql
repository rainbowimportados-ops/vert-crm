-- Ativar pacientes: filtros e ações em massa.
-- 1) A lista do quadro passa a trazer a caixa, a origem do lead (Google Ads,
--    Meta Ads, Instagram, site, direto) e as etiquetas manuais do contato, e
--    aceita _connection nulo para mostrar todas as caixas (sempre com RLS).
-- 2) Retorno com data em massa: quem vê a conversa pode criar o lembrete.

drop function if exists public.crm_ativacao_lista(uuid);

create function public.crm_ativacao_lista(_connection uuid)
returns table(
  conversation_id uuid, contact_id uuid, nome text, telefone text, instagram text, assignee_id uuid,
  ultima_direcao text, ultima_msg_em timestamptz, ultimo_texto text, ultima_entrada_em timestamptz,
  manutencao boolean, resolvida_em timestamptz, texto_paciente text, audio_sem_resposta boolean,
  lead_etapa text, lead_origem text, resumo text, proximo text, etiquetas text[], valor text,
  resumo_base_em timestamptz, clinica_status text, clinica_aguardando numeric, clinica_aprovado numeric,
  clinica_url text, connection_id uuid, origem text, tags text[]
)
language sql
stable
set search_path to 'public'
as $function$
  select
    c.id, ct.id, ct.name, ct.phone, ct.instagram_username, c.assignee_id,
    ult.direction, ult.message_at, left(coalesce(nullif(ult.content, ''), ult.transcricao, ''), 280),
    ent.message_at,
    coalesce(sai.content ~* 'manuten', false) and (ent.message_at is null or ent.message_at < sai.message_at),
    c.ativacao_resolvida_em,
    left(coalesce(nullif(ent.content, ''), ent.transcricao, ''), 280),
    exists (
      select 1 from public.messages a
      where a.conversation_id = c.id and a.direction = 'in' and a.type = 'audio'
        and (sai.message_at is null or a.message_at > sai.message_at)
    ),
    ld.status, ld.source,
    r.resumo, r.proximo, r.etiquetas, r.valor, r.base_msg_em,
    s.status, s.total_aguardando, s.total_aprovado, s.external_url,
    c.connection_id,
    public.crm_origem_lead(ld.source, coalesce(ld.utm, '{}'::jsonb), w.channel),
    coalesce((
      select array_agg(t.label order by t.label)
      from public.contact_tags x join public.tags t on t.id = x.tag_id
      where x.contact_id = ct.id
    ), '{}'::text[])
  from public.conversations c
  join public.whatsapp_connections w on w.id = c.connection_id and coalesce(w.is_active, true)
  join public.crm_contacts ct on ct.id = c.contact_id
  cross join lateral (
    select m.direction, m.message_at, m.content, m.transcricao from public.messages m
    where m.conversation_id = c.id order by m.message_at desc limit 1
  ) ult
  left join lateral (
    select m.message_at, m.content, m.transcricao from public.messages m
    where m.conversation_id = c.id and m.direction = 'in' order by m.message_at desc limit 1
  ) ent on true
  left join lateral (
    select m.message_at, m.content from public.messages m
    where m.conversation_id = c.id and m.direction = 'out' order by m.message_at desc limit 1
  ) sai on true
  left join lateral (
    select l.status, l.source, l.utm from public.crm_leads l
    where l.contact_id = ct.id and (l.connection_id = c.connection_id or l.connection_id is null)
    order by l.created_at desc limit 1
  ) ld on true
  left join public.crm_ativacao_resumos r on r.conversation_id = c.id
  left join public.crm_clinic_snapshots s on s.contact_id = ct.id
  where (_connection is null or c.connection_id = _connection)
    and c.last_message_at > now() - interval '120 days'
    and ct.deleted_at is null;
$function$;

revoke all on function public.crm_ativacao_lista(uuid) from public, anon;
grant execute on function public.crm_ativacao_lista(uuid) to authenticated, service_role;

drop policy if exists "criar compromisso em conversa visivel" on public.crm_compromissos;
create policy "criar compromisso em conversa visivel" on public.crm_compromissos
  for insert with check (
    organization_id = public.crm_current_org()
    and exists (select 1 from public.conversations c where c.id = crm_compromissos.conversation_id)
  );
grant insert on public.crm_compromissos to authenticated;
