-- 109: Financeiro sem trava — favorecidos, contas a pagar, dívidas, fila de arquivos,
-- colunas de banco/confiança em financeiro_lancamentos. Spec: docs/superpowers/specs/2026-08-29-modulo-financeiro-pj-pf-design.md
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Dicionário de favorecidos (quem é quem)
CREATE TABLE IF NOT EXISTS financeiro_favorecidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  nome text NOT NULL,
  doc_mascarado text,
  padroes text[] NOT NULL DEFAULT '{}',
  categoria_slug text NOT NULL DEFAULT 'outros',
  mundo_padrao text NOT NULL DEFAULT 'PJ' CHECK (mundo_padrao IN ('PJ','PF','FRONTEIRA')),
  tipo_padrao text CHECK (tipo_padrao IN ('despesa','entrada')),
  observacao text,
  aprendido_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_fav_company ON financeiro_favorecidos(company_id);

-- 2) Contas a pagar (o "a receber" já existe: financeiro_contas_a_receber)
CREATE TABLE IF NOT EXISTS financeiro_contas_a_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  vencimento date NOT NULL,
  mundo text NOT NULL DEFAULT 'PJ' CHECK (mundo IN ('PJ','PF')),
  categoria_slug text NOT NULL DEFAULT 'outros',
  favorecido_id uuid REFERENCES financeiro_favorecidos(id) ON DELETE SET NULL,
  divida_id uuid,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','divida','fatura','guia','seed')),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
  pago_em date,
  lancamento_id uuid REFERENCES financeiro_lancamentos(id) ON DELETE SET NULL,
  lembretes jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_pagar_venc ON financeiro_contas_a_pagar(status, vencimento);

-- 3) Dívidas (parcelas recorrentes geram contas a pagar)
CREATE TABLE IF NOT EXISTS financeiro_dividas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  credor text NOT NULL,
  contrato text,
  mundo text NOT NULL DEFAULT 'PJ' CHECK (mundo IN ('PJ','PF')),
  saldo_ref numeric(14,2),
  parcela numeric(14,2) NOT NULL,
  dia_vencimento int NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  ultima_parcela date,
  taxa_mensal numeric(7,4),
  garantia text,
  observacao text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE financeiro_contas_a_pagar
  ADD CONSTRAINT fin_pagar_divida_fk FOREIGN KEY (divida_id) REFERENCES financeiro_dividas(id) ON DELETE SET NULL;

-- 4) Fila de arquivos (PDF/imagem/CSV pesados lidos fora do webhook)
CREATE TABLE IF NOT EXISTS financeiro_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  origem text NOT NULL CHECK (origem IN ('zap','tela')),
  tipo text NOT NULL DEFAULT 'outro' CHECK (tipo IN ('extrato','fatura','comprovante','guia','outro')),
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  bytes int NOT NULL DEFAULT 0,
  paginas int,
  paginas_ok int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'fila' CHECK (status IN ('fila','lendo','ok','erro_parcial','erro')),
  tentativas int NOT NULL DEFAULT 0,
  erro text,
  lancamentos_criados int NOT NULL DEFAULT 0,
  enviado_por text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_arq_status ON financeiro_arquivos(status, created_at);

-- 5) financeiro_lancamentos: banco, favorecido, confiança, fila, dedupe
ALTER TABLE financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS banco_conta text NOT NULL DEFAULT 'desconhecido'
    CHECK (banco_conta IN ('sicoob_cc','sicoob_cartao','itau_pj','itau_pf','visa_emp','latam','santander_pj','mercado_pago','dinheiro','desconhecido')),
  ADD COLUMN IF NOT EXISTS favorecido_id uuid REFERENCES financeiro_favorecidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confianca text NOT NULL DEFAULT 'media'
    CHECK (confianca IN ('alta','media','baixa','pendente')),
  ADD COLUMN IF NOT EXISTS arquivo_id uuid REFERENCES financeiro_arquivos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hash_dedupe text;
ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_lancamentos_origem_check;
ALTER TABLE financeiro_lancamentos
  ADD CONSTRAINT financeiro_lancamentos_origem_check
  CHECK (origem IN ('zap_midia','zap_texto','extrato','tela','conta'));
ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_lancamentos_pf_pj_check;
ALTER TABLE financeiro_lancamentos
  ADD CONSTRAINT financeiro_lancamentos_pf_pj_check CHECK (pf_pj IN ('PF','PJ','FRONTEIRA'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_lanc_hash
  ON financeiro_lancamentos(hash_dedupe) WHERE hash_dedupe IS NOT NULL AND status <> 'apagado';

-- 6) RLS (template da casa, 108_dashboard_senha_tokens.sql)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['financeiro_favorecidos','financeiro_contas_a_pagar','financeiro_dividas','financeiro_arquivos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS company_isolation ON public.%I', t);
    EXECUTE format($p$CREATE POLICY company_isolation ON public.%I AS PERMISSIVE FOR ALL
      USING (company_id = (SELECT coalesce(nullif(current_setting('app.company_id', true), '')::uuid, (auth.jwt() ->> 'company_id')::uuid)))
      WITH CHECK (company_id = (SELECT coalesce(nullif(current_setting('app.company_id', true), '')::uuid, (auth.jwt() ->> 'company_id')::uuid)))$p$, t);
  END LOOP;
END $$;
