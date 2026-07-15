-- Migration 077: Fase 1 da fundacao multi-tenant -- Passo 1/4 (coluna nullable)
-- Decisao de vocabulario: docs/ecosof/02-decisao-vocabulario.md (Opcao A -- manter
-- companies/company_id, aprovada pelo Junior em 15/07/2026).
--
-- Ordem zero-downtime (nunca travar tabela grande em producao):
--   [1] ADD COLUMN nullable + DEFAULT constante  <- esta migration
--   [2] backfill em lotes (migration 078 + docs/ecosof/03-rollout-company-id-lote1.md)
--   [3] SET NOT NULL (so depois do backfill confirmado, tabela por tabela)
--   [4] CREATE INDEX CONCURRENTLY (idem)
--   [5] RLS de verdade -- fora do escopo desta tarefa (Jonnata)
--
-- "ADD COLUMN ... DEFAULT <constante>" e metadata-only no Postgres 11+ (nao reescreve a
-- tabela, nao segura lock de escrita) -- seguro pra tabela de qualquer tamanho. DEFAULT
-- aponta pra EcoSun (unico tenant real hoje) pra que QUALQUER insert novo, mesmo de
-- codigo que ainda nao foi ajustado pra setar company_id explicitamente, ja nasca
-- correto -- e o que deixa o passo [3] (NOT NULL) seguro sem exigir mudanca de app-code
-- em paralelo em ~60 tabelas.
--
-- Sem REFERENCES companies(id) inline de proposito: a validacao da FK faria o Postgres
-- escanear a tabela nesse mesmo passo. Adicionar a FK (NOT VALID + VALIDATE CONSTRAINT
-- depois do backfill) fica registrado como decisao em aberto no runbook, nao decidido
-- aqui.
--
-- tenant_id/company_id NUNCA vem do frontend -- so do login (JWT) ou do webhook. Regra
-- de app-code, nao desta migration, mas repetida aqui pra quem for setar o valor depois.
--
-- Tabelas de FORA desta migration (motivo completo em
-- docs/ecosof/03-rollout-company-id-lote1.md):
--   ja tem company_id (056/057/061/069): companies, dashboard_roles, dashboard_users,
--     audit_log, leads, lead_atividades, lead_tarefas, lead_ia_conversas, eventos_elo.
--   conceito diferente (RAG, tenant_id text): eva_knowledge_chunks.
--   globais/singleton/referencia, NAO viram por-tenant nesta fase: app_flags, logs,
--     monitoring_config, monitoring_treino, telemetria_catalogo, empresa_config,
--     empresa_kits, financeiro_anexos.

ALTER TABLE alertas_sistema                ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE blog_drafts                    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE channel_daily_metrics          ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE conversation_patterns          ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE conversations                  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE custos_fixos                   ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE custos_ia_uso                  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE dm_messages                    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE dm_threads                     ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE dossiers                       ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE elo_memoria                    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE elo_uso                        ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE email_descadastro              ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE email_modelos                  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE email_sequencia                ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE engineers                      ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE eva_cadence                    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE eva_intro_pending              ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE external_articles              ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE fechamentos                    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financeiro_atividades          ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financeiro_categorias          ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financeiro_contas_a_receber    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financeiro_lancamentos         ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financeiro_materiais_compras   ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financeiro_parametros          ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financeiro_recebimentos        ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financeiro_receita_mensal      ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE followups                      ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE geracao_diaria                 ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE lead_anexos                    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE learning_insights              ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE maintenance_reminders          ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE manutencoes                    ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE marketing_alerts               ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE marketing_campaign_logs        ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE marketing_campaigns            ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE marketing_creative_logs        ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE marketing_creatives            ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE marketing_drafts               ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE marketing_personas             ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE meta_ads_insights              ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE meta_leadgen_events            ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE monitoring_abordagens          ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE monitoring_alerts              ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE ordens_servico                 ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE os_fotos                       ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE pos_venda_sugestao_memoria     ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE post_install_touches           ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE proposta_attachments           ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE proposta_visualizacoes         ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE propostas_publicas             ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE reengagement_touches           ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE relatorio_slugs                ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE relatorios_pos_instalacao      ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE rh_candidatos                  ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE rh_vagas                       ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE sistemas_clientes              ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE telemetria_medicoes            ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE telemetria_resumo              ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE testimonials                   ADD COLUMN IF NOT EXISTS company_id uuid DEFAULT '00000000-0000-0000-0000-000000000001';

-- Total: 61 tabelas.
