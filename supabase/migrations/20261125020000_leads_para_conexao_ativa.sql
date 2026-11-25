-- Leads do site presos na conexão antiga da Evolution.
--
-- Os leads entram no número padrão ativo. Até 24/11 era a conexão
-- "ATENDIMENTO VERT" (Evolution); com a troca para o Zernio ela ficou
-- inativa, e o RLS de crm_leads (crm_can_access_connection exige is_active)
-- passou a esconder os 73 leads: a tela Leads mostra 0.
--
-- Esta migração passa os leads de conexões inativas para a conexão ativa do
-- mesmo número (preferindo a padrão). O gatilho que abre conversa fica
-- desligado durante a troca para não criar dezenas de conversas "Novo lead"
-- de uma vez na caixa de entrada; a conversa é aberta quando alguém clica no
-- lead (startConversation no painel ativo).
-- Para voltar: update crm_leads set connection_id = '<id antigo>' where ...

alter table public.crm_leads disable trigger trg_crm_leads_abre_conversa;

with destino as (
  select antiga.id as de, alvo.id as para
  from public.whatsapp_connections antiga
  cross join lateral (
    select n.id
    from public.whatsapp_connections n
    where n.organization_id = antiga.organization_id
      and n.is_active
      and coalesce(n.channel, 'whatsapp') = 'whatsapp'
      and right(regexp_replace(coalesce(n.phone_number, ''), '\D', '', 'g'), 10)
        = right(regexp_replace(coalesce(antiga.phone_number, ''), '\D', '', 'g'), 10)
    order by n.is_default desc, n.created_at
    limit 1
  ) alvo
  where not antiga.is_active
    and coalesce(antiga.phone_number, '') <> ''
)
update public.crm_leads l
set connection_id = d.para
from destino d
where l.connection_id = d.de;

alter table public.crm_leads enable trigger trg_crm_leads_abre_conversa;
