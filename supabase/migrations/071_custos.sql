-- Migration 071: Cofre de Custos do Elo (medidor de IA + custos fixos)
-- Parte do "contador de gastos" que vive camuflado no Elo (só o CEO abre com PIN).
-- Meta/Google ad spend NAO precisam de tabela nova (já vivem em meta_ads_insights
-- e channel_daily_metrics). Aqui só as 2 fontes que faltavam:
--   1) custos_ia_uso  — cada chamada de IA (Claude) grava tokens + custo estimado
--   2) custos_fixos   — assinaturas/servidor que o admin cadastra na mão
-- Idempotente (IF NOT EXISTS).

-- 1) Medidor de IA: uma linha por chamada de modelo. custo_cents em CENTAVOS DE
-- REAL (já convertido de USD pelo motor no código, com a cotação do momento).
CREATE TABLE IF NOT EXISTS custos_ia_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  modelo text NOT NULL,
  origem text,                          -- 'eva' | 'elo' | 'email' | ...
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cache_read_tokens bigint NOT NULL DEFAULT 0,
  cache_write_tokens bigint NOT NULL DEFAULT 0,
  custo_cents integer NOT NULL DEFAULT 0 CHECK (custo_cents >= 0)
);
CREATE INDEX IF NOT EXISTS idx_custos_ia_uso_created ON custos_ia_uso (created_at DESC);

-- 2) Custos fixos mensais (servidor, assinaturas). valor_cents = R$ por mês.
CREATE TABLE IF NOT EXISTS custos_fixos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  valor_cents integer NOT NULL CHECK (valor_cents >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custos_fixos_ativo ON custos_fixos (ativo);

-- RLS: mesma postura das outras tabelas (service role acessa; o app controla).
ALTER TABLE custos_ia_uso ENABLE ROW LEVEL SECURITY;
ALTER TABLE custos_fixos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON custos_ia_uso FOR ALL USING (true);
CREATE POLICY "Service role full access" ON custos_fixos FOR ALL USING (true);

COMMENT ON TABLE custos_ia_uso IS 'Medidor de custo de IA (Claude) — 1 linha por chamada. custo_cents em BRL.';
COMMENT ON TABLE custos_fixos IS 'Custos fixos mensais (servidor/assinaturas) cadastrados pelo admin. valor_cents em BRL/mês.';
