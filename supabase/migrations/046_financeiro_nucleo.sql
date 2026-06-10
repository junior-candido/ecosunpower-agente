-- supabase/migrations/046_financeiro_nucleo.sql
-- Núcleo Financeiro (Fatia 2) — lado receita + imposto multi-anexo.
-- Spec: docs/superpowers/specs/2026-06-07-nucleo-financeiro-receita-imposto-design.md
-- 5 tabelas: anexos (referência), atividades (catálogo), receita_mensal (buckets RBT12),
-- contas_a_receber (uma por venda), parametros (config da empresa).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Tabelas de referência dos anexos do Simples (espelha src/modules/financeiro/anexos.ts)
CREATE TABLE IF NOT EXISTS financeiro_anexos (
  anexo text NOT NULL,
  faixa int NOT NULL,
  rbt12_min numeric(14,2) NOT NULL,
  rbt12_max numeric(14,2) NOT NULL,
  nominal numeric(7,4) NOT NULL,
  deduzir numeric(14,2) NOT NULL,
  PRIMARY KEY (anexo, faixa),
  CONSTRAINT financeiro_anexos_anexo_check CHECK (anexo IN ('I','II','III','IV','V')),
  CONSTRAINT financeiro_anexos_faixa_check CHECK (faixa BETWEEN 1 AND 6)
);

INSERT INTO financeiro_anexos (anexo, faixa, rbt12_min, rbt12_max, nominal, deduzir) VALUES
  ('I',1,0,180000,0.0400,0),('I',2,180000.01,360000,0.0730,5940),('I',3,360000.01,720000,0.0950,13860),
  ('I',4,720000.01,1800000,0.1070,22500),('I',5,1800000.01,3600000,0.1430,87300),('I',6,3600000.01,4800000,0.1900,378000),
  ('II',1,0,180000,0.0450,0),('II',2,180000.01,360000,0.0780,5940),('II',3,360000.01,720000,0.1000,13860),
  ('II',4,720000.01,1800000,0.1120,22500),('II',5,1800000.01,3600000,0.1470,85500),('II',6,3600000.01,4800000,0.3000,720000),
  ('III',1,0,180000,0.0600,0),('III',2,180000.01,360000,0.1120,9360),('III',3,360000.01,720000,0.1350,17640),
  ('III',4,720000.01,1800000,0.1600,35640),('III',5,1800000.01,3600000,0.2100,125640),('III',6,3600000.01,4800000,0.3300,648000),
  ('IV',1,0,180000,0.0450,0),('IV',2,180000.01,360000,0.0900,8100),('IV',3,360000.01,720000,0.1020,12420),
  ('IV',4,720000.01,1800000,0.1400,39780),('IV',5,1800000.01,3600000,0.2200,183780),('IV',6,3600000.01,4800000,0.3300,828000),
  ('V',1,0,180000,0.1550,0),('V',2,180000.01,360000,0.1800,4500),('V',3,360000.01,720000,0.1950,9900),
  ('V',4,720000.01,1800000,0.2050,17100),('V',5,1800000.01,3600000,0.2300,62100),('V',6,3600000.01,4800000,0.3050,540000)
ON CONFLICT (anexo, faixa) DO NOTHING;

-- 2) Catálogo de atividades (atividade -> anexo); configurável (revenda futura)
CREATE TABLE IF NOT EXISTS financeiro_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnae text,
  anexo_padrao text NOT NULL,
  sujeito_fator_r boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_atividades_anexo_check CHECK (anexo_padrao IN ('I','II','III','IV','V'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_atividades_cnae ON financeiro_atividades(cnae);

INSERT INTO financeiro_atividades (nome, cnae, anexo_padrao, sujeito_fator_r) VALUES
  ('Instalação',  '4321-5/00', 'III', false),
  ('Equipamento', '4742-3/00', 'I',   false),
  ('Comissão',    '7490-1/04', 'V',   true)
ON CONFLICT (cnae) DO NOTHING;

-- 3) Receita realizada por mês (buckets pro RBT12 rolante)
CREATE TABLE IF NOT EXISTS financeiro_receita_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL,                 -- 'YYYY-MM'
  atividade_id uuid REFERENCES financeiro_atividades(id) ON DELETE SET NULL,
  receita numeric(14,2) NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'sistema',    -- 'seed' | 'sistema'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_receita_competencia_check CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_receita_comp_ativ
  ON financeiro_receita_mensal(competencia, COALESCE(atividade_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4) Contas a receber (uma por venda fechada)
CREATE TABLE IF NOT EXISTS financeiro_contas_a_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  atividade_id uuid REFERENCES financeiro_atividades(id) ON DELETE SET NULL,
  descricao text,
  valor numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  valor_recebido numeric(14,2) NOT NULL DEFAULT 0,
  data_recebimento date,
  competencia_recebimento text,
  imposto_provisorio numeric(14,2),
  imposto_confirmado numeric(14,2),
  anexo_aplicado text,
  aliquota_efetiva numeric(7,4),
  faixa int,
  rbt12_no_calculo numeric(14,2),
  fator_r_no_calculo numeric(7,4),           -- ratio decimal (0.28 = 28%)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT fin_contas_status_check
    CHECK (status IN ('pendente','recebido_parcial','recebido','cancelado')),
  CONSTRAINT fin_contas_competencia_check
    CHECK (competencia_recebimento IS NULL OR competencia_recebimento ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX IF NOT EXISTS idx_fin_contas_status ON financeiro_contas_a_receber(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_contas_comp ON financeiro_contas_a_receber(competencia_recebimento);
-- Uma conta ativa por fechamento (duplo clique no botão de atividade não duplica)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_contas_fechamento_unq
  ON financeiro_contas_a_receber(fechamento_id)
  WHERE fechamento_id IS NOT NULL AND status <> 'cancelado';

-- 5) Parâmetros da empresa (singleton; vira por-empresa na revenda)
CREATE TABLE IF NOT EXISTS financeiro_parametros (
  id int PRIMARY KEY DEFAULT 1,
  razao_social text,
  cnpj text,
  pro_labore_mensal numeric(14,2) NOT NULL DEFAULT 0,
  outras_folhas_mensal numeric(14,2) NOT NULL DEFAULT 0,
  dia_alerta_das int NOT NULL DEFAULT 15,
  dia_vencimento_das int NOT NULL DEFAULT 20,
  margem_alerta_faixa numeric(14,2) NOT NULL DEFAULT 20000,
  fator_r_alerta numeric(7,4) NOT NULL DEFAULT 0.30, -- ratio decimal (0.30 = 30%)
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_parametros_singleton CHECK (id = 1)
);
INSERT INTO financeiro_parametros (id, razao_social, cnpj)
  VALUES (1, 'ECOSUNPOWER ENERGIA SOLAR LTDA', '33.020.459/0001-06')
ON CONFLICT (id) DO NOTHING;

-- 6) Soma atômica de receita no bucket do mês (elimina corrida read-then-write
-- e erro silencioso; chamada via client.rpc('fin_somar_receita_mes', ...)).
CREATE OR REPLACE FUNCTION fin_somar_receita_mes(p_competencia text, p_atividade_id uuid, p_valor numeric)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO financeiro_receita_mensal (competencia, atividade_id, receita, origem)
  VALUES (p_competencia, p_atividade_id, p_valor, 'sistema')
  ON CONFLICT (competencia, COALESCE(atividade_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET receita = financeiro_receita_mensal.receita + EXCLUDED.receita,
                updated_at = now();
$$;
