-- 067_telemetria.sql — Fundação da telemetria (piloto Sungrow)
-- ⚠️ Confirmar o número 067 no grupo antes de aplicar (regra do CLAUDE.md).
-- Coleta+guarda TODAS as grandezas do inversor de 15 em 15 min. Modelo longo/genérico.

-- Catálogo: mapeia o ponto nativo da marca -> código normalizado + rótulo/unidade.
CREATE TABLE IF NOT EXISTS telemetria_catalogo (
  marca         text NOT NULL,
  device_type   int  NOT NULL,
  ponto_nativo  text NOT NULL,          -- id do ponto na API (Sungrow: '24','13112'...)
  ponto         text NOT NULL,          -- normalizado ('potencia','tensao_cc_mppt1'...)
  rotulo        text NOT NULL,
  unidade       text NOT NULL,
  categoria     text NOT NULL,          -- tensao|corrente|potencia|energia|temperatura|outro
  PRIMARY KEY (marca, device_type, ponto_nativo)
);

-- Medições finas (15 min), PARTICIONADA POR MÊS em ts.
CREATE TABLE IF NOT EXISTS telemetria_medicoes (
  sistema_id  uuid NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  device_key  text NOT NULL,
  ponto       text NOT NULL,
  ts          timestamptz NOT NULL,
  valor       double precision NOT NULL,
  unidade     text NOT NULL,
  PRIMARY KEY (sistema_id, device_key, ponto, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS idx_telemetria_med_lookup
  ON telemetria_medicoes (sistema_id, device_key, ponto, ts);

-- Partições dos 12 meses do piloto (jul/2026..jun/2027). Novos meses: acrescentar
-- mais partições numa migration futura (ou a retenção dropa os antigos). Sem rpc.
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2026_07 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2026_08 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2026_09 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2026_10 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2026_11 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2026_12 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2027_01 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2027_02 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2027_03 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2027_04 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2027_05 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS telemetria_medicoes_2027_06 PARTITION OF telemetria_medicoes FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

-- Resumo diário (do que passou de 6 meses) — leve, pra sempre.
CREATE TABLE IF NOT EXISTS telemetria_resumo (
  sistema_id  uuid NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  device_key  text NOT NULL,
  ponto       text NOT NULL,
  dia         date NOT NULL,
  valor_min   double precision NOT NULL,
  valor_max   double precision NOT NULL,
  valor_med   double precision NOT NULL,
  unidade     text NOT NULL,
  PRIMARY KEY (sistema_id, device_key, ponto, dia)
);

-- Seed do catálogo Sungrow (inversor string, device_type=1). Pontos base confirmados;
-- tensão CC/CA e corrente por fase entram após a validação ao vivo do fetchTelemetry.
INSERT INTO telemetria_catalogo (marca, device_type, ponto_nativo, ponto, rotulo, unidade, categoria) VALUES
  ('sungrow', 1, '24', 'potencia',      'Potência ativa',    'kW',  'potencia'),
  ('sungrow', 1, '1',  'energia_dia',    'Geração do dia',    'kWh', 'energia'),
  ('sungrow', 1, '2',  'energia_total',  'Geração total',     'kWh', 'energia'),
  ('sungrow', 1, '14', 'potencia_cc',    'Potência CC total', 'kW',  'potencia'),
  ('sungrow', 1, '11', 'potencia_mppt1', 'Potência MPPT1',    'kW',  'potencia'),
  ('sungrow', 1, '12', 'potencia_mppt2', 'Potência MPPT2',    'kW',  'potencia')
ON CONFLICT DO NOTHING;
