-- supabase/migrations/025_marketing_schema.sql
-- Schema completo da Equipe de Marketing IA (4 agentes + dashboard)

-- 1. PERSONAS (pre-definidas, seedadas pelo script seed-marketing-personas.ts)
CREATE TABLE marketing_personas (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,           -- 'residencial_df', 'comercial_go', 'fazendeiro_offgrid', 'ev_byd', etc
  nome TEXT NOT NULL,                    -- 'Residencial DF — Casa Plano Piloto'
  categoria_portfolio TEXT NOT NULL CHECK (categoria_portfolio IN ('on_grid_residencial','on_grid_comercial','hibrido','off_grid','ev_charger','manutencao')),
  descricao TEXT NOT NULL,
  conta_minima_brl INTEGER NOT NULL DEFAULT 700,
  consumo_minimo_kwh INTEGER NOT NULL DEFAULT 700,
  regiao_alvo TEXT NOT NULL,             -- 'DF', 'GO_entorno', 'todo_atendimento'
  palavras_proibidas TEXT[] DEFAULT ARRAY['alugar terra','arrendar','fazenda solar','engenheiro'],
  contexto_marca JSONB,                  -- tom, valores, exemplos de copy aprovado
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_personas_codigo ON marketing_personas(codigo);

-- 2. CRIATIVOS (pacote gerado pelo Agente Criativo, status reflete fluxo aprovacao)
CREATE TABLE marketing_creatives (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL REFERENCES marketing_personas(id),
  briefing TEXT NOT NULL,                -- input que gerou
  status TEXT NOT NULL CHECK (status IN ('draft','aprovado','em_uso','pausado','descartado')),
  imagens JSONB NOT NULL,                -- [{url, style, prompt_used}, ...]
  copies JSONB NOT NULL,                 -- [{length, headline, body, cta}, ...]
  cta_primario TEXT NOT NULL,
  justificativa TEXT,
  created_by_model TEXT NOT NULL,        -- 'claude-opus-4-7' ou 'claude-haiku-4-5'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by_phone TEXT,                -- numero zap do Junior
  meta_creative_id TEXT                  -- ID na Meta quando publicado (ads creative ID)
);
CREATE INDEX idx_creatives_status ON marketing_creatives(status);
CREATE INDEX idx_creatives_persona ON marketing_creatives(persona_id);

-- 3. LOG DE GERACAO (auditoria do Agente Criativo)
CREATE TABLE marketing_creative_logs (
  id BIGSERIAL PRIMARY KEY,
  creative_id BIGINT REFERENCES marketing_creatives(id) ON DELETE CASCADE,
  prompt_used TEXT NOT NULL,
  raw_output JSONB NOT NULL,
  filter_results JSONB,                  -- {blocklist:passed, marca:passed, criterio_700:passed}
  decision TEXT NOT NULL,                -- 'sent_to_junior', 'rejected_filter', 'regenerated'
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CAMPANHAS (espelho da Meta + metadados internos)
CREATE TABLE marketing_campaigns (
  id BIGSERIAL PRIMARY KEY,
  meta_campaign_id TEXT NOT NULL UNIQUE,
  codigo_portfolio TEXT NOT NULL,        -- 'A', 'B', 'C', 'D', 'E', 'F'
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  daily_budget_cents INTEGER,
  lifetime_budget_cents INTEGER,
  status TEXT NOT NULL,                  -- 'active', 'paused', 'archived'
  cpl_alerta_brl INTEGER NOT NULL DEFAULT 50,
  cpl_critico_brl INTEGER NOT NULL DEFAULT 80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);
CREATE INDEX idx_campaigns_meta_id ON marketing_campaigns(meta_campaign_id);
CREATE INDEX idx_campaigns_status ON marketing_campaigns(status);

-- 5. LOG DE DECISOES DO AGENTE CAMPANHA
CREATE TABLE marketing_campaign_logs (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  meta_creative_id TEXT,                 -- se decisao for sobre criativo especifico
  action TEXT NOT NULL,                  -- 'monitored', 'paused_creative', 'alert_sent', 'budget_change_proposed'
  reason TEXT NOT NULL,
  metrics_snapshot JSONB NOT NULL,       -- {cpl, ctr, conv_rate, ...}
  decided_by TEXT NOT NULL,              -- 'agent' ou 'junior'
  approved_by_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. INSIGHTS META (snapshot a cada 2h)
CREATE TABLE meta_ads_insights (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  meta_ad_id TEXT,                       -- ad-level (criativo)
  spend_cents INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  reach INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  ctr_pct NUMERIC(5,2),
  cpc_cents INTEGER,
  cpm_cents INTEGER,
  leads INTEGER DEFAULT 0,
  cpl_cents INTEGER,
  raw_payload JSONB NOT NULL,            -- preserva resposta original Meta
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_insights_campaign_date ON meta_ads_insights(campaign_id, date_start);
CREATE INDEX idx_insights_collected ON meta_ads_insights(collected_at DESC);

-- 7. CONVERSAS IG DM (similar a conversations mas separada)
CREATE TABLE dm_threads (
  id BIGSERIAL PRIMARY KEY,
  ig_user_id TEXT NOT NULL,              -- IG-scoped user ID (nao publico)
  ig_thread_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','qualified_handed_off','disqualified','escalated_human','abandoned')),
  source_campaign_id BIGINT REFERENCES marketing_campaigns(id),
  source_creative_id BIGINT REFERENCES marketing_creatives(id),
  qualified_data JSONB,                  -- {tipo_imovel, cidade, faixa_conta, decisao}
  handoff_zap_phone TEXT,                -- phone que recebeu handoff (se foi handed_off)
  context_for_eva JSONB,                 -- contexto pra Eva continuar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX idx_dm_threads_status ON dm_threads(status);
CREATE INDEX idx_dm_threads_ig_user ON dm_threads(ig_user_id);

-- 8. MENSAGENS DE CADA THREAD (pra historico/replay)
CREATE TABLE dm_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  content TEXT NOT NULL,
  buttons JSONB,                         -- se tinha quick replies
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dm_messages_thread ON dm_messages(thread_id, created_at);

-- 9. ALERTAS PENDENTES (Analista + Campanha geram, dashboard mostra)
CREATE TABLE marketing_alerts (
  id BIGSERIAL PRIMARY KEY,
  agent TEXT NOT NULL,                   -- 'analyst', 'campaign', 'creative'
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  related_campaign_id BIGINT REFERENCES marketing_campaigns(id),
  related_creative_id BIGINT REFERENCES marketing_creatives(id),
  action_required TEXT,                  -- 'approve_pause', 'approve_budget', 'review', null
  status TEXT NOT NULL CHECK (status IN ('pending','acknowledged','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_alerts_status ON marketing_alerts(status);
CREATE INDEX idx_alerts_severity ON marketing_alerts(severity, created_at DESC);

-- 10. COLUNAS EM TABELAS EXISTENTES
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_creative_id BIGINT REFERENCES marketing_creatives(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_campaign_id BIGINT REFERENCES marketing_campaigns(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS dm_thread_id BIGINT REFERENCES dm_threads(id);

-- 11. View consolidada pra Dashboard (helper)
CREATE OR REPLACE VIEW v_marketing_dashboard_today AS
SELECT
  COALESCE(SUM(spend_cents), 0) / 100.0 AS spend_today_brl,
  COALESCE(SUM(leads), 0) AS leads_today,
  COALESCE(SUM(clicks), 0) AS clicks_today,
  COALESCE(SUM(impressions), 0) AS impressions_today,
  CASE WHEN SUM(leads) > 0 THEN (SUM(spend_cents)::NUMERIC / SUM(leads) / 100) ELSE NULL END AS cpl_today_brl
FROM meta_ads_insights
WHERE date_start = CURRENT_DATE;
