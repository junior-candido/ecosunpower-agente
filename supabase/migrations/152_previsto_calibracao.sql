-- supabase/migrations/152_previsto_calibracao.sql
-- CALIBRAÇÃO AUTOMÁTICA (Energy Studio, Marco 1 — 02/10/2026).
--
-- Para cada usina, o motor compara a curva REAL hora a hora (dias de céu limpo)
-- com a curva simulada em 144 combinações de orientação × inclinação e guarda a
-- que melhor reproduz a forma. Usada no Previsto × Real quando o cadastro não
-- tem orientação/inclinação (ou para avisar que o cadastro parece errado).
-- `fator` = quanto a usina rende do que a física diz (sujeira, sombra, kWp errado…).

CREATE TABLE IF NOT EXISTS previsto_calibracao (
  sistema_id       uuid        PRIMARY KEY REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status           text        NOT NULL CHECK (status IN ('ok','sem_curva','sem_dias_limpos','erro')),
  motivo           text,
  azimute          numeric(5,1),
  inclinacao       numeric(4,1),
  fator            numeric(5,3),
  erro_forma       numeric(6,4),
  erro_referencia  numeric(6,4),
  confianca        text        CHECK (confianca IN ('alta','media','baixa')),
  dias_usados      int,
  datas            date[],
  mapa             jsonb,
  versao_modelo    text,
  calculado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_previsto_calibracao_empresa ON previsto_calibracao (company_id);

COMMENT ON TABLE previsto_calibracao IS
  'Orientação/inclinação descobertas pela forma da curva real (motor /calibrar). Escrita só pelo servidor.';

ALTER TABLE previsto_calibracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE previsto_calibracao FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS previsto_calibracao_ler ON previsto_calibracao;
CREATE POLICY previsto_calibracao_ler ON previsto_calibracao
  AS PERMISSIVE FOR SELECT
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- Conferência
SELECT count(*) AS calibracoes FROM previsto_calibracao;
