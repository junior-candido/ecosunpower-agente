-- 079 — RLS DE VERDADE, Fase A ("trancar as portas pra estranhos")
-- Passo 5 do bloco multi-tenant (spec: docs/ecosof/04-rls-fase-a-b.md).
--
-- O QUE ESTA MIGRATION FAZ (e por quê):
-- 1. ENABLE + FORCE ROW LEVEL SECURITY nas 69 tabelas com company_id.
--    Pré-voo de 16/07 confirmou: `postgres` e `service_role` têm BYPASSRLS
--    → o app (service key) e o SQL Editor NÃO mudam de comportamento.
--    Quem NÃO tem bypass (anon/authenticated) passa a bater em porta trancada.
-- 2. APOSENTA as políticas "Service role full access" USING (true) criadas em
--    migrations antigas: service_role BYPASSA RLS — a política não servia pra
--    ele; servia só pra ESCANCARAR a tabela pra qualquer outro papel.
-- 3. Cria a política `company_isolation` em cada tabela: só enxerga/escreve a
--    linha quem provar que é da MESMA empresa. A prova vem de dois lugares
--    (Fase B liga um deles; até lá, sem prova = sem linha):
--      a) `set local app.company_id = '<uuid>'` (conexão direta com role de app)
--      b) claim `company_id` do JWT (caminho PostgREST/Supabase)
--    company_id NUNCA vem do frontend (regra do blueprint).
-- 4. `companies` isola por `id` (a linha da empresa é o "apartamento" dela).
-- 5. `logs` (global, sem company_id): remove o USING(true); fica RLS ligado sem
--    política = só quem tem bypass lê (app e SQL Editor). Log não é público.
--
-- O que NÃO muda: `public_reviews` (políticas de anon são INTENCIONAIS — o site
-- lê depoimentos aprovados); tabelas globais/singleton seguem como estão
-- (RLS ligado sem política = negado por padrão pra quem não tem bypass).
-- Partições da telemetria: política no PAI vale pra consulta via pai; as
-- partições ficam RLS-ligado-sem-política (acesso direto negado — ok).

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    -- 61 do Lote 1 (077) + leads e irmãs (056/057/061/069) = 69
    'alertas_sistema','audit_log','blog_drafts','channel_daily_metrics',
    'conversation_patterns','conversations','custos_fixos','custos_ia_uso',
    'dashboard_roles','dashboard_users','dm_messages','dm_threads','dossiers',
    'elo_memoria','elo_uso','email_descadastro','email_modelos',
    'email_sequencia','engineers','eva_cadence','eva_intro_pending',
    'eventos_elo','external_articles','fechamentos','financeiro_atividades',
    'financeiro_categorias','financeiro_contas_a_receber',
    'financeiro_lancamentos','financeiro_materiais_compras',
    'financeiro_parametros','financeiro_recebimentos',
    'financeiro_receita_mensal','followups','geracao_diaria','lead_anexos',
    'lead_atividades','lead_ia_conversas','lead_tarefas','leads',
    'learning_insights','maintenance_reminders','manutencoes',
    'marketing_alerts','marketing_campaign_logs','marketing_campaigns',
    'marketing_creative_logs','marketing_creatives','marketing_drafts',
    'marketing_personas','meta_ads_insights','meta_leadgen_events',
    'monitoring_abordagens','monitoring_alerts','ordens_servico','os_fotos',
    'pos_venda_sugestao_memoria','post_install_touches','proposta_attachments',
    'proposta_visualizacoes','propostas_publicas','reengagement_touches',
    'relatorio_slugs','relatorios_pos_instalacao','rh_candidatos','rh_vagas',
    'sistemas_clientes','telemetria_medicoes','telemetria_resumo','testimonials'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- política antiga escancarada (onde existir) sai de cena
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON %I', t);
    -- idempotência: rodar 2x não duplica
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY company_isolation ON %I
        AS PERMISSIVE FOR ALL
        USING (company_id = (SELECT coalesce(
            nullif(current_setting('app.company_id', true), '')::uuid,
            (auth.jwt() ->> 'company_id')::uuid)))
        WITH CHECK (company_id = (SELECT coalesce(
            nullif(current_setting('app.company_id', true), '')::uuid,
            (auth.jwt() ->> 'company_id')::uuid)))
    $p$, t);
  END LOOP;
END $$;

-- companies: o "apartamento" é a própria linha (isola por id, não company_id)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON companies;
CREATE POLICY company_isolation ON companies
  AS PERMISSIVE FOR ALL
  USING (id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- logs (global): o USING(true) abria a tabela pra quem não devia. Sem política,
-- só bypass (app/Editor) lê — log de sistema não é dado público.
DROP POLICY IF EXISTS "Service role full access" ON logs;
