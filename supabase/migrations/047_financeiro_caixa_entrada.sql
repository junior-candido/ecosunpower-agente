-- supabase/migrations/047_financeiro_caixa_entrada.sql
-- Caixa de Entrada Universal (Fatia 3) — despesas + entradas avulsas via Eva.
-- Spec: docs/superpowers/specs/2026-06-11-caixa-entrada-universal-design.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Categorias de lançamento (lista fixa; adicionar nova = 1 INSERT)
CREATE TABLE IF NOT EXISTS financeiro_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO financeiro_categorias (slug, nome) VALUES
  ('combustivel', 'Combustível'),
  ('material_eletrico', 'Material elétrico'),
  ('equipamento_kit', 'Equipamento/Kit'),
  ('mao_de_obra', 'Mão de obra'),
  ('alimentacao', 'Alimentação'),
  ('ferramenta', 'Ferramenta'),
  ('veiculo_manutencao', 'Veículo/Manutenção'),
  ('marketing_ads', 'Marketing/Anúncios'),
  ('software_assinatura', 'Software/Assinatura'),
  ('imposto_das', 'Imposto/DAS'),
  ('pro_labore', 'Pró-labore'),
  ('taxa_bancaria', 'Taxa bancária'),
  ('outros', 'Outros')
ON CONFLICT (slug) DO NOTHING;

-- 2) Lançamentos (despesa + entrada). Pendente vive AQUI (sobrevive restart).
--    pf_pj é nullable no pendente (Eva pergunta com botões); obrigatório pra
--    confirmar (trava na aplicação).
CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL
    CHECK (tipo IN ('despesa', 'entrada')),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'confirmado', 'apagado')),
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  data_evento date NOT NULL,
  competencia text NOT NULL
    CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  contraparte text,
  descricao text,
  categoria_id uuid REFERENCES financeiro_categorias(id) ON DELETE SET NULL,
  pf_pj text CHECK (pf_pj IN ('PF', 'PJ')),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  fechamento_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL,
  conta_id uuid REFERENCES financeiro_contas_a_receber(id) ON DELETE SET NULL,
  storage_path text,
  mime_type text,
  origem text NOT NULL
    CHECK (origem IN ('zap_midia', 'zap_texto')),
  message_id text,
  extracao jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_lanc_status
  ON financeiro_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_competencia
  ON financeiro_lancamentos(competencia);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_tipo_comp
  ON financeiro_lancamentos(tipo, competencia);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_categoria
  ON financeiro_lancamentos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_pfpj_comp
  ON financeiro_lancamentos(pf_pj, competencia);
