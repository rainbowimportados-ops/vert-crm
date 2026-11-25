-- Panorama das caixas de entrada: uma linha no topo do CRM com o que pede
-- atenção (responder hoje, retomar, ativar, manutenção), de onde vieram as
-- conversas novas (Google Ads, Meta Ads, Instagram, site, direto) e quem é ou
-- não paciente no sistema da clínica. Roda com o login de quem chama (RLS).

create or replace function public.crm_origem_lead(_source text, _utm jsonb, _canal text)
returns text
language sql
immutable
as $$
  select case
    when _utm ?| array['gclid', 'gad_source', 'gbraid', 'wbraid'] then 'google_ads'
    when _utm ? 'fbclid'
      or lower(coalesce(_utm->>'utm_medium', '')) in ('cpc', 'paid', 'paid_social', 'ads', 'ppc')
      or lower(coalesce(_utm->>'utm_source', '')) in ('facebook_ads', 'meta_ads', 'fb_ads', 'meta') then 'meta_ads'
    when _source like 'site:%' and lower(coalesce(_utm->>'utm_source', '')) in ('ig', 'instagram') then 'instagram'
    when _source like 'site:%' then 'site'
    when _canal = 'instagram' then 'instagram'
    else 'direto'
  end;
$$;

create or replace function public.crm_panorama()
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with conv as (
    select
      c.id, c.connection_id, c.contact_id, c.unread_count,
      (select min(m.message_at) from public.messages m where m.conversation_id = c.id) as primeira_em,
      ult.direction as ult_dir, ult.message_at as ult_em,
      coalesce(sai.content ~* 'manuten', false) and (ent.message_at is null or ent.message_at < sai.message_at) as manut,
      c.ativacao_resolvida_em is not null and c.ativacao_resolvida_em >= ult.message_at as resolvida,
      public.crm_origem_lead(ld.source, coalesce(ld.utm, '{}'::jsonb), w.channel) as origem,
      s.status as clinica, coalesce(s.total_aguardando, 0) as aguardando
    from public.conversations c
    join public.whatsapp_connections w on w.id = c.connection_id
    join public.crm_contacts ct on ct.id = c.contact_id and ct.deleted_at is null
    cross join lateral (
      select m.direction, m.message_at from public.messages m
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
    left join public.crm_clinic_snapshots s on s.contact_id = ct.id
    where c.last_message_at > now() - interval '120 days'
      and coalesce(w.is_active, true)
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
  por_caixa as (
    select
      w.id, w.display_name, w.channel, w.provider, w.phone_number,
      count(g.id) filter (where g.unread_count > 0) as nao_lidas,
      count(g.id) filter (where g.gaveta = 'hoje') as hoje,
      count(g.id) filter (where g.gaveta = 'retomar') as retomar,
      count(g.id) filter (where g.gaveta = 'ativar') as ativar,
      count(g.id) filter (where g.gaveta = 'manut') as manut
    from public.whatsapp_connections w
    left join gav g on g.connection_id = w.id
    where coalesce(w.is_active, true)
    group by w.id
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'caixas', coalesce((select jsonb_agg(to_jsonb(p) order by p.hoje + p.retomar desc, p.display_name) from por_caixa p), '[]'::jsonb),
    'total', (select jsonb_build_object(
        'nao_lidas', count(*) filter (where unread_count > 0),
        'hoje', count(*) filter (where gaveta = 'hoje'),
        'retomar', count(*) filter (where gaveta = 'retomar'),
        'ativar', count(*) filter (where gaveta = 'ativar'),
        'manut', count(*) filter (where gaveta = 'manut')
      ) from gav),
    'origem_7d', (select coalesce(jsonb_object_agg(origem, jsonb_build_object('novas', novas, 'esperando', esperando)), '{}'::jsonb) from (
        select origem, count(*) as novas,
               count(*) filter (where gaveta in ('hoje', 'retomar')) as esperando
        from gav where primeira_em > now() - interval '7 days' group by origem
      ) o),
    'clinica', (select jsonb_build_object(
        'pacientes', count(*) filter (where clinica = 'ok'),
        'conquistar', count(*) filter (where clinica = 'nao_encontrado'),
        'a_conferir', count(*) filter (where clinica is null or clinica = 'erro'),
        'aguardando', coalesce(sum(aguardando) filter (where clinica = 'ok'), 0)
      ) from gav where gaveta is not null)
  );
$$;

grant execute on function public.crm_panorama() to authenticated;
grant execute on function public.crm_origem_lead(text, jsonb, text) to authenticated;

-- Fila da conferência automática no sistema da clínica: contatos com conversa
-- nos últimos 14 dias sem ficha, ou com ficha velha (7 dias) ou com erro (1 dia).
-- Só o service role usa (edge function crm-clinica, chamada pelo cron).
create or replace function public.crm_clinica_pendentes(_org uuid, _limite int default 6)
returns table(contact_id uuid, name text, phone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select ct.id, ct.name, ct.phone
  from public.conversations c
  join public.crm_contacts ct on ct.id = c.contact_id and ct.deleted_at is null
  left join public.crm_clinic_snapshots s on s.contact_id = ct.id
  where c.organization_id = _org
    and c.last_message_at > now() - interval '14 days'
    and coalesce(length(regexp_replace(ct.phone, '[^0-9]', '', 'g')), 0) >= 10
    and (
      s.contact_id is null
      or (s.status = 'erro' and s.buscado_em < now() - interval '1 day')
      or (s.status <> 'erro' and not s.vinculado_manual and s.buscado_em < now() - interval '7 days')
    )
  group by ct.id, ct.name, ct.phone
  order by max(c.last_message_at) desc
  limit greatest(1, least(_limite, 20));
$$;

revoke all on function public.crm_clinica_pendentes(uuid, int) from public, anon, authenticated;

-- A cada 15 min, a crm-clinica confere alguns contatos no sistema da clínica.
select cron.unschedule('crm-clinica-lote') where exists (select 1 from cron.job where jobname = 'crm-clinica-lote');
select cron.schedule(
  'crm-clinica-lote',
  '7,22,37,52 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/crm-clinica',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-sync-token', public.crm_zernio_sync_token()
    ),
    body := '{"acao":"lote"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);
