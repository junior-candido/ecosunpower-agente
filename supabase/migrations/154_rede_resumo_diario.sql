-- supabase/migrations/154_rede_resumo_diario.sql
-- RADAR DA REDE (Energy Studio, Marco 2 — 02/10/2026).
-- Um resumo por usina e dia da qualidade da tensão (mesma análise da aba Rede):
-- máxima/mínima, minutos fora da faixa ANEEL, minutos ≥ 242 V e desligamentos
-- prováveis por tensão. Alimenta o mapa da rede por bairro e o Radar BT.
-- Escrita só pelo servidor (rotina 23h30 BRT); a empresa só LÊ as suas linhas.

CREATE TABLE IF NOT EXISTS rede_resumo_diario (
  sistema_id         uuid        NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  dia                date        NOT NULL,
  company_id         uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nominal_v          smallint,
  v_min              numeric(6,1),
  v_max              numeric(6,1),
  min_precaria       int         NOT NULL DEFAULT 0,
  min_critica        int         NOT NULL DEFAULT 0,
  min_acima_desarme  int         NOT NULL DEFAULT 0,
  desarmes           int         NOT NULL DEFAULT 0,
  nivel              text        NOT NULL CHECK (nivel IN ('ok','atencao','critico','sem_dado')),
  fonte              text        NOT NULL,
  calculado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sistema_id, dia)
);

CREATE INDEX IF NOT EXISTS idx_rede_resumo_empresa_dia ON rede_resumo_diario (company_id, dia DESC);

COMMENT ON TABLE rede_resumo_diario IS
  'Radar da Rede: qualidade da tensão por usina e dia (aba Rede resumida). Escrita só pelo servidor.';

ALTER TABLE rede_resumo_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE rede_resumo_diario FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rede_resumo_ler ON rede_resumo_diario;
CREATE POLICY rede_resumo_ler ON rede_resumo_diario
  AS PERMISSIVE FOR SELECT
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

SELECT count(*) AS resumos FROM rede_resumo_diario;
