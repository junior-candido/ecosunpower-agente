-- Tabela de visualizacoes individuais de proposta publica.
--
-- Hoje (commit 44e84ba) cada acesso a /p/:slug incrementa um contador
-- (`propostas_publicas.acessos`) e notifica Junior no zap toda vez (throttle
-- 5min). Mas nao tem registro historico individual.
--
-- Esta tabela registra UMA linha por abertura (preview admin OU cliente real),
-- permitindo timeline, KPIs de engajamento e dashboard completo.
--
-- Decisao Junior 13/05/2026: versao completa com timeline + filtros + KPIs.

CREATE TABLE IF NOT EXISTS proposta_visualizacoes (
  id BIGSERIAL PRIMARY KEY,
  proposta_slug TEXT NOT NULL REFERENCES propostas_publicas(slug) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,                                  -- pra inferir abertura unica vs refresh
  user_agent TEXT,                                  -- mobile? desktop? bot?
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,        -- TRUE = Junior abriu via ?eu=<token>
  referer TEXT,                                     -- de onde clicou (zap, e-mail, link direto)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_propvis_slug_time
  ON proposta_visualizacoes(proposta_slug, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_propvis_real_time
  ON proposta_visualizacoes(viewed_at DESC)
  WHERE is_preview = FALSE;  -- queries de dashboard filtram preview por padrao

COMMENT ON TABLE proposta_visualizacoes IS
  'Registro individual de cada abertura de proposta publica /p/:slug. 1 linha por acesso.';

COMMENT ON COLUMN proposta_visualizacoes.is_preview IS
  'TRUE quando Junior abriu via ?eu=<PROPOSAL_PREVIEW_TOKEN>. Excluir dos KPIs cliente-facing.';
