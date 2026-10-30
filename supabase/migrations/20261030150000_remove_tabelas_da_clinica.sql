-- Remove do banco do CRM as tabelas do VertControl (clínica).
--
-- Contexto (30/10/2026): o banco xiskevunqbvmoclygppc passa a ser só do VERT
-- CRM e do site institutovert.app. Os dados da clínica (pacientes, agenda,
-- orçamentos, financeiro, estoque, Clara etc.) foram exportados para um backup
-- .sql e conferidos tabela a tabela ANTES desta migração. Pacientes e agenda
-- voltam depois, de um banco externo.
--
-- Aplicar SOMENTE no banco de produção atual e SÓ depois do backup conferido.
-- Num banco criado do zero pelo schema_do_crm, estas tabelas nem existem e
-- tudo aqui vira no-op (if exists).
--
-- O que muda para o que fica:
--   * crm_match_patient passa a devolver null (era a busca em patients). Quem
--     chama: crm_ingest_message, crm_import_chats, crm_import_contacts,
--     crm_backfill_message, crm_start_conversation. Precisa trocar ANTES do
--     drop, senão a entrada de mensagens do WhatsApp quebra.
--   * crm_import_contacts perde o UPDATE final que lia patients.
--   * CASCADE remove só as 6 FKs para tabelas da clínica (crm_contacts.patient_id,
--     crm_leads.patient_id/budget_id/interest_procedure_id,
--     conversations.interest_procedure_id, ai_quick_responses.config_id).
--     As colunas ficam, como uuid solto. Conferido: nenhuma policy, view ou
--     trigger de tabela que fica depende das que saem.
--   * Storage não é mexido: buckets e arquivos continuam.

begin;

-- 1. Funções do CRM sem dependência de patients ---------------------------------
-- Quando o banco externo de pacientes existir, e aqui que a busca volta.
CREATE OR REPLACE FUNCTION public.crm_match_patient(_org uuid, _phone_norm text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- sem banco de pacientes neste projeto: nenhum contato e casado com paciente
  select null::uuid
$function$
;

-- crm_import_contacts: igual a de producao, menos o ultimo UPDATE, que copiava
-- o nome do paciente (public.patients) para o contato. Em plpgsql isso so
-- falharia na hora da chamada -- e a importacao inteira de contatos da
-- crm-import cairia junto.
CREATE OR REPLACE FUNCTION public.crm_import_contacts(_org uuid, _rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _n integer := 0; _u integer := 0;
begin
  create temporary table if not exists _imp_contacts (
    phone text, name text, jid text, avatar text, norm text
  ) on commit drop;
  delete from _imp_contacts where true;   -- "where true" satisfaz o guarda do Supabase

  insert into _imp_contacts (phone, name, jid, avatar, norm)
  select distinct on (public.crm_normalize_phone(r->>'phone'))
         r->>'phone',
         nullif(trim(r->>'name'), ''),
         nullif(trim(r->>'jid'), ''),
         nullif(trim(r->>'avatar'), ''),
         public.crm_normalize_phone(r->>'phone')
  from jsonb_array_elements(_rows) as r
  where public.crm_normalize_phone(r->>'phone') <> ''
  order by public.crm_normalize_phone(r->>'phone'),
           (nullif(trim(r->>'name'), '') is null);

  with ins as (
    insert into public.crm_contacts (organization_id, phone, name, wa_jid, avatar_url, patient_id, is_lead)
    select _org, i.phone, coalesce(i.name, i.phone), i.jid, i.avatar,
           public.crm_match_patient(_org, i.norm), false
    from _imp_contacts i
    on conflict (organization_id, phone_normalized) where (phone_normalized <> '') do nothing
    returning 1
  )
  select count(*) into _n from ins;

  with upd as (
    update public.crm_contacts c
       set name = i.name,
           wa_jid = coalesce(c.wa_jid, i.jid),
           updated_at = now()
    from _imp_contacts i
    where c.organization_id = _org
      and c.phone_normalized = i.norm
      and c.deleted_at is null
      and i.name is not null
      and (c.name is null or c.name = c.phone or c.name = c.phone_normalized)
    returning 1
  )
  select count(*) into _u from upd;

  -- foto: so vale URL interna do bucket. A URL crua da CDN do WhatsApp expira em
  -- poucos dias e nao deve ser gravada aqui (quem cuida disso e a crm-avatars).
  update public.crm_contacts c
     set avatar_url = i.avatar, updated_at = now()
  from _imp_contacts i
  where c.organization_id = _org
    and c.phone_normalized = i.norm
    and c.deleted_at is null
    and i.avatar is not null
    and i.avatar like 'wa-pics:%'
    and c.avatar_url is distinct from i.avatar;

  -- REMOVIDO em relacao a producao: o UPDATE que copiava o nome de
  -- public.patients para o contato. Sem tabela de pacientes neste banco.

  return _n + _u;
end;
$function$
;

-- permissões iguais às de produção (só service_role chama)
revoke all on function public.crm_match_patient(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_match_patient(uuid, text) to service_role;
revoke all on function public.crm_import_contacts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crm_import_contacts(uuid, jsonb) to service_role;

-- 2. Funções que só existiam para a clínica --------------------------------------
drop function if exists public.audit_financial_entries_duplicates() cascade;
drop function if exists public.crm_review_receipt cascade;
drop function if exists public.create_organization cascade;
drop function if exists public.decrease_stock_on_sale() cascade;
drop function if exists public.replace_budget_items cascade;
drop function if exists public.sync_exam_status_to_treatment_plan() cascade;
drop function if exists public.update_stock_on_movement() cascade;

-- 3. Tabelas da clínica ---------------------------------------------------------
drop table if exists public."_backup_doctors_20260810" cascade;
drop table if exists public."_backup_financeiro_master_20260729" cascade;
drop table if exists public."agenda_preferences" cascade;
drop table if exists public."agenda_settings" cascade;
drop table if exists public."ai_agent_configs" cascade;
drop table if exists public."ai_knowledge_base" cascade;
drop table if exists public."ai_legal_documents" cascade;
drop table if exists public."ai_procedures" cascade;
drop table if exists public."ai_processing_logs" cascade;
drop table if exists public."ai_recall_templates" cascade;
drop table if exists public."appointment_statuses" cascade;
drop table if exists public."appointments" cascade;
drop table if exists public."audit_logs" cascade;
drop table if exists public."automation_executions" cascade;
drop table if exists public."automation_logs" cascade;
drop table if exists public."automations" cascade;
drop table if exists public."backup_agenda_desvio_fuso" cascade;
drop table if exists public."backup_conversas_mal_arquivadas_20260817" cascade;
drop table if exists public."budget_files" cascade;
drop table if exists public."budget_items" cascade;
drop table if exists public."budgets" cascade;
drop table if exists public."clara_memories" cascade;
drop table if exists public."crm_receipt_entries" cascade;
drop table if exists public."dental" cascade;
drop table if exists public."doctors" cascade;
drop table if exists public."document_templates" cascade;
drop table if exists public."exams" cascade;
drop table if exists public."feature_flags" cascade;
drop table if exists public."financial_entries" cascade;
drop table if exists public."financial_entries_dedup_audit" cascade;
drop table if exists public."financial_expenses" cascade;
drop table if exists public."holidays" cascade;
drop table if exists public."inbox_itens" cascade;
drop table if exists public."integration_registry" cascade;
drop table if exists public."lista_de_espera" cascade;
drop table if exists public."media_library" cascade;
drop table if exists public."menu_items" cascade;
drop table if exists public."message_status_history" cascade;
drop table if exists public."notifications" cascade;
drop table if exists public."odontograma_condicoes" cascade;
drop table if exists public."odontograma_lancamentos" cascade;
drop table if exists public."patient_clinical_records" cascade;
drop table if exists public."patient_documents" cascade;
drop table if exists public."patient_installments" cascade;
drop table if exists public."patients" cascade;
drop table if exists public."price_list_rules" cascade;
drop table if exists public."procedure_doctors" cascade;
drop table if exists public."procedure_items" cascade;
drop table if exists public."procedures" cascade;
drop table if exists public."products" cascade;
drop table if exists public."proteticos" cascade;
drop table if exists public."purchases" cascade;
drop table if exists public."room_renters" cascade;
drop table if exists public."rooms" cascade;
drop table if exists public."sales" cascade;
drop table if exists public."scheduled_tasks" cascade;
drop table if exists public."shopping_list" cascade;
drop table if exists public."stock_locations" cascade;
drop table if exists public."stock_movements" cascade;
drop table if exists public."suppliers" cascade;
drop table if exists public."system_announcements" cascade;
drop table if exists public."system_settings" cascade;
drop table if exists public."system_versions" cascade;
drop table if exists public."tasks" cascade;
drop table if exists public."tpd_orders" cascade;
drop table if exists public."treatment_plan_items" cascade;
drop table if exists public."treatment_plans" cascade;
drop table if exists public."triage_progress" cascade;
drop table if exists public."triage_stage_progress" cascade;
drop table if exists public."triage_stages" cascade;
drop table if exists public."working_hours" cascade;

commit;
