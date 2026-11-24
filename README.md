# VERT CRM

CRM de WhatsApp do Instituto Vert: conversas, contatos, leads, etiquetas, respostas rápidas, campanhas e relatórios, com o WhatsApp conectado pela Evolution API.

App independente, separado do VertControl.

## Banco

O CRM usa o Supabase do Instituto Vert (`xiskevunqbvmoclygppc`). Desde 30/10/2026 esse banco é só do CRM e do site institutovert.app: as tabelas da clínica (VertControl) foram exportadas para backup e removidas.

| Migração | Para quê |
|---|---|
| `20261030120000_schema_do_crm.sql` | Recria o banco do CRM do zero num projeto novo. Não rodar no banco atual. |
| `20261030150000_remove_tabelas_da_clinica.sql` | Tira as tabelas da clínica do banco atual. Só depois do backup conferido. |
| `20261124120000_leads_do_site_no_whatsapp.sql` | Leads da landing page e do cartão digital entram no WhatsApp padrão com conversa aberta. Corrige os que já entraram. |

## Vendas

- **Conversas** separadas por vendedor (Todas, Minhas, Sem responsável, Não lidas), por etapa do funil, por origem do lead (landing page, cartão digital, cadastro manual, WhatsApp direto) e por número de WhatsApp (seletor no menu).
- **Funil** (tela Leads): Novo → Em contato → Negociação → Ganho / Perdido. As etapas usam os valores de `crm_leads.status` (`novo`, `em_atendimento`, `aguardando`, `finalizado`, `perdido`); nomes em `src/crm/sdk/funil.ts`.
- Na conversa, o seletor "Funil" muda a etapa ou transforma o contato em lead.

Detalhes, edge functions e segredos em `supabase/MIGRACAO.md`.

## Rodar

```sh
cp .env.example .env   # preencher com o projeto Supabase do CRM
npm install
npm run dev            # http://localhost:8080
npm run build          # gera dist/ (Vercel)
npm test
```

## Variáveis

| Variável | O que é |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase do CRM |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável do mesmo projeto |

Na Vercel, as duas vão em Settings → Environment Variables.

## Rotas

| Rota | Tela |
|---|---|
| `/login` | Entrar (e-mail/senha ou Google) |
| `/reset-password` | Nova senha |
| `/` | CRM em tela cheia — exige login, clínica ativa e acesso ao módulo `crm` |

Qualquer outra rota volta para `/`.

## Pacientes e agenda

O CRM não guarda pacientes nem agendamentos. Toda a ligação com esses dados fica em `src/crm/services/clinic.ts` e só é usada quando a integração está ligada no manifesto da instalação (`crm_installations.manifest.integrations`: `patients`, `agenda`, `procedures`, `budgets`). Desligadas, o CRM funciona normalmente e esconde "Agendar", "Valores" e os dados da ficha.

Quando o banco de pacientes e agendamentos for conectado, é ali que a integração entra.

## Origem

Extraído do VertControl em 30/10/2026 (`src/crm`, login e permissões). O VertControl não depende deste repositório.
