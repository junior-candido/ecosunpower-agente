-- supabase/migrations/151_geracao_esperada_previsto_real.sql
-- PREVISTO × REAL (Energy Studio, Marco 1 — 01/10/2026).
--
-- Quanto cada usina DEVERIA ter gerado em cada dia, calculado pelo motor
-- (simulador-fv) com o sol REAL daquele dia (Open-Meteo) + telhado/inclinação/
-- kWp do cadastro. Comparado com geracao_diaria (o que gerou de verdade).
-- Escrita só pela rotina do servidor; a empresa só LÊ as suas linhas.

CREATE TABLE IF NOT EXISTS geracao_esperada (
  sistema_id               uuid        NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  data                     date        NOT NULL,
  company_id               uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kwh_previsto             numeric(10,2) NOT NULL CHECK (kwh_previsto >= 0),
  kwh_hora                 jsonb       NOT NULL,
  irradiacao_kwh_m2        numeric(6,3),
  irradiacao_plano_kwh_m2  numeric(6,3),
  indice_ceu               numeric(5,3),
  clima                    text        NOT NULL CHECK (clima IN ('limpo','parcial','nublado','chuva','sem_dado')),
  premissas                jsonb       NOT NULL,
  fonte_clima              text        NOT NULL,
  versao_modelo            text        NOT NULL,
  calculado_em             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sistema_id, data)
);

CREATE INDEX IF NOT EXISTS idx_geracao_esperada_empresa_data
  ON geracao_esperada (company_id, data DESC);

COMMENT ON TABLE geracao_esperada IS
  'Previsto × Real: kWh que a usina deveria gerar no dia com o clima real (motor simulador-fv). Escrita só pelo servidor.';

ALTER TABLE geracao_esperada ENABLE ROW LEVEL SECURITY;
ALTER TABLE geracao_esperada FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geracao_esperada_ler ON geracao_esperada;
CREATE POLICY geracao_esperada_ler ON geracao_esperada
  AS PERMISSIVE FOR SELECT
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

COMMENT ON COLUMN empresa_modulos.modulo IS
  'eva | email | pasta_digital | monitoramento | financeiro | fiscal | rh | marketing | medicao | previsto_real';

-- Conferência: tabela criada, vazia.
SELECT count(*) AS previstos FROM geracao_esperada;
