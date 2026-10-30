# Migração do banco do CRM

Banco novo, só com o CRM, criado por `migrations/20261030120000_schema_do_crm.sql`.
Origem: o banco do VertControl (baseline de 01/09/2026, conferido contra produção em 30/10/2026).

Validação local (Postgres 16 puro, sem a imagem do Supabase):

```sh
psql -v ON_ERROR_STOP=1 -f supabase/tests/stubs_supabase_local.sql   # o que o Supabase já traz
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261030120000_schema_do_crm.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/smoke_crm.sql              # termina em ROLLBACK
```

Os stubs não fazem parte da migration. pg_net e pg_cron não existem no Postgres puro: a migration
testa se estão disponíveis e segue sem elas.

## Tabelas incluídas (37)

| Grupo | Tabelas |
|---|---|
| Plataforma | `organizations`, `units`, `profiles`, `user_roles`, `organization_members`, `role_permissions`, `app_modules`, `app_versions`, `theme_settings`, `error_logs`, `listas`, `login_attempts` |
| CRM | `crm_installations`, `crm_members`, `whatsapp_connections`, `crm_connection_members`, `crm_contacts`, `conversations`, `messages`, `conversation_assignments`, `crm_leads`, `tags`, `contact_tags`, `quick_replies`, `internal_notes`, `followups`, `campaigns`, `campaign_recipients`, `crm_auto_messages`, `crm_keepalive_state` |
| IA | `ai_agent_settings`, `ai_profiles`, `ai_suggestions`, `ai_quick_responses` |
| Eventos | `webhook_inbox`, `provider_events`, `domain_events` |

Também: enum `app_role`, schemas `private` e `private_security`, 46 funções, 14 triggers em `public`
+ 3 em `auth.users`, 81 policies em `public` + 5 em `storage.objects`, buckets `crm-media` e
`whatsapp-pics`, e `crm_contacts`/`conversations`/`messages` na publicação do Realtime.

## Tabelas que ficaram de fora

- **Clínica:** `patients`, `appointments`, `appointment_statuses`, `budgets`, `budget_files`,
  `budget_items`, `procedures`, `procedure_items`, `procedure_doctors`, `price_list_rules`, `doctors`,
  `rooms`, `room_renters`, `working_hours`, `agenda_preferences`, `agenda_settings`, `holidays`,
  `lista_de_espera`, `exams`, `dental`, `odontograma_*`, `treatment_plans`, `treatment_plan_items`,
  `triage_*`, `patient_*`, `tpd_orders`, `proteticos`, `financial_*`, `crm_receipt_entries`,
  `products`, `purchases`, `sales`, `stock_*`, `suppliers`, `shopping_list`, `document_templates`.
- **Clara / IA do VertControl:** `ai_agent_configs`, `ai_knowledge_base`, `ai_legal_documents`,
  `ai_procedures`, `ai_processing_logs`, `ai_recall_templates`, `clara_memories`.
- **Outros do VertControl:** `automations`, `automation_executions`, `automation_logs`, `tasks`,
  `message_status_history`, `notifications`, `audit_logs`, `feature_flags`, `integration_registry`,
  `inbox_itens`, `media_library`, `menu_items`, `scheduled_tasks`, `system_*`. Nenhum é lido pelo app
  nem pelas edge functions do CRM.
- **Criadas em produção depois do baseline, não são do CRM:** `site_*` (site institutovert.app),
  `digital_card_*`, `landing_content`, `link_clicks`, `wa_cloud_*`.
- Backups pontuais (`_backup_*`, `backup_*`).

## FKs removidas (a coluna continua, como uuid simples)

| Coluna | Apontava para | Situação |
|---|---|---|
| `crm_contacts.patient_id` | `patients` | vai apontar para o banco externo de pacientes |
| `crm_leads.patient_id` | `patients` | idem |
| `crm_leads.budget_id` | `budgets` | banco externo (orçamentos) |
| `crm_leads.interest_procedure_id` | `procedures` | banco externo (procedimentos) |
| `conversations.interest_procedure_id` | `procedures` | idem |
| `ai_quick_responses.config_id` | `ai_agent_configs` | tabela da Clara, não migra |

Cada uma tem `comment on column` explicando.

## Funções reescritas

- **`crm_match_patient`**: devolvia o paciente com o mesmo telefone em `patients`; agora devolve
  sempre `null`. Mesma assinatura, então `crm_ingest_message`, `crm_backfill_message`,
  `crm_import_chats`, `crm_import_contacts` e `crm_start_conversation` não mudam.
- **`crm_import_contacts`**: sem o último `UPDATE`, que copiava o nome do paciente para o contato.

Não vieram: `create_organization` (cria status de agenda e procedimentos padrão, ou seja, dados da
clínica), `crm_review_receipt` (financeiro) e as funções de estoque, financeiro e agenda.

## O que o baseline não tinha e a migration acrescenta (conferido em produção)

- 5 colunas em `crm_leads` criadas direto em produção: `intent`, `source_surface`, `utm`,
  `entry_page`, `entry_cta`.
- `GRANT USAGE` nos schemas `private` e `private_security`. Sem ele, toda policy que chama
  `private.*` falha para o usuário logado.
- Os `EXECUTE` das funções, copiados de produção. `crm_ingest_message`, `crm_import_*`,
  `crm_apply_chat_labels`, `crm_toggle_chat_label`, `crm_backfill_message` e `crm_whatsapp_keepalive`
  ficam só com a `service_role`. Sem isso qualquer um com a chave anon chamaria essas funções.
- O Realtime de `crm_contacts`, `conversations` e `messages`.

## Edge functions a publicar no projeto novo

Código em `vertcontrol/supabase/functions/<nome>/`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` o Supabase já injeta. Os segredos abaixo são só os que precisam ser
cadastrados.

| Função | Quem chama | verify_jwt | Segredos |
|---|---|---|---|
| `evolution-webhook` | Evolution API | **false** | — |
| `crm-evolution` | app | true | `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` |
| `crm-webhook-setup` | app | true | — |
| `crm-send-message` | app | true | `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` |
| `crm-media` | app | true | `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` |
| `crm-import` | app | true | `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` |
| `crm-whatsapp-settings` | app | true | — |
| `crm-team` | app | true | — |
| `crm-campaign-dispatch` | app | true | — |
| `crm-ai-assist` | app | true | `OPENAI_API_KEY`, `AI_API_KEY` |
| `crm-ai-agent` | evolution-webhook | **false** | `OPENAI_API_KEY` |
| `crm-avatars` | evolution-webhook | true | — |
| `crm-history-import` | evolution-webhook | true | — |
| `secure-login` | app (login) | **false** | — |
| `wa-guardian` | VPS da Evolution (cron) | **false** | — (o segredo vem de `crm_keepalive_state.guardian_secret`) |

Pontos de atenção:
- `crm-ai-assist` e `crm-ai-agent` leem `procedures` para montar o prompt. A tabela não existe aqui:
  a consulta devolve erro e o prompt sai com "(nenhum cadastrado)". Não quebra, mas a IA fica sem a
  tabela de preços até o banco externo existir.
- `evolution-webhook` chama `crm-receipt-ocr`, que não existe nem em produção (a chamada falha em
  silêncio). Não publicar.

## Ordem para migrar os dados

Carregar com `set session_replication_role = replica;` na sessão de carga. Isso desliga triggers e
checagem de FK durante o `COPY`. Sem isso, `handle_new_user` e `assign_admin_to_first_user` disparam a
cada usuário importado, `set_org_id` e `crm_validate_whatsapp_assignment` reescrevem/validam linhas e
`crm_touch_updated_at` mexe em `updated_at`. Mesmo assim, siga a ordem abaixo para conferir a
integridade ao final.

1. **`auth.users`** (e `auth.identities`), com os mesmos `id`. Tudo depende disso.
2. `organizations`
3. `units`
4. `profiles`, `user_roles`, `organization_members`
5. `role_permissions`, `app_modules`, `app_versions`, `theme_settings`, `listas` (só os tipos que o
   CRM usa, como `config_geral`; o resto é da clínica)
6. `crm_installations`
7. `crm_members`
8. `whatsapp_connections` (depende de `units`, `crm_installations` e `profiles`)
9. `crm_connection_members`
10. `crm_contacts`: **sem a coluna `phone_normalized`** no `COPY`, porque ela é gerada
11. `conversations`
12. `messages`
13. `conversation_assignments`, `internal_notes`, `followups`, `ai_suggestions`
14. `crm_leads`
15. `tags`, depois `contact_tags`
16. `quick_replies`, `ai_quick_responses`, `crm_auto_messages`, `ai_agent_settings`, `ai_profiles`
17. `campaigns`, depois `campaign_recipients`
18. `crm_keepalive_state` (1 linha; manter o `guardian_secret`, que o `wa-guardian` do VPS usa)
19. Opcionais (log/histórico): `provider_events` (copiar os recentes, porque servem de deduplicação
    no webhook), `domain_events`, `webhook_inbox`, `error_logs`, `login_attempts`

Depois da carga:
- `set session_replication_role = origin;`
- Copiar os arquivos dos buckets `crm-media` e `whatsapp-pics` (pela API de Storage, não por SQL),
  mantendo os mesmos caminhos: `messages.media_url` e `crm_contacts.avatar_url` (`wa-pics:...`)
  apontam para eles.
- Repontar o webhook de cada instância da Evolution para o projeto novo (tela de conexão do CRM →
  `crm-webhook-setup`).
- Desligar o job `crm-whatsapp-keepalive` no banco antigo e só então ligá-lo no novo (instruções na
  seção 15 da migration).
- Configurar no painel o que não é SQL: login por e-mail e Google, URLs de redirecionamento,
  templates de e-mail.
