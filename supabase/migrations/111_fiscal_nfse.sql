-- 111: módulo fiscal (NFS-e) — F1: preparar/anexar; F2 usará as mesmas tabelas pra emitir.
CREATE TABLE IF NOT EXISTS fiscal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE DEFAULT '00000000-0000-0000-0000-000000000001',
  cnpj text NOT NULL,
  inscricao_municipal text NOT NULL,
  razao_social text NOT NULL,
  regime text NOT NULL DEFAULT 'simples_nacional',
  municipio text NOT NULL DEFAULT 'Brasília',
  uf text NOT NULL DEFAULT 'DF',
  cert_validade date,                -- F1: digitada à mão; F2: lida do .pfx
  cert_storage_path text,            -- F2 (fica NULL na F1)
  cert_senha_cifrada text,           -- F2 (fica NULL na F1)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  nome text NOT NULL,
  cod_trib_nacional text NOT NULL,   -- ex.: '31.01.02'
  nbs text,                          -- ex.: '1.1415.00.00'
  descricao_padrao text NOT NULL,
  aliquota_iss numeric(5,4) NOT NULL DEFAULT 0.05,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fiscal_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  status text NOT NULL DEFAULT 'preparada'
    CHECK (status IN ('rascunho','preparada','enviada','autorizada','rejeitada','cancelada')),
  numero text,                       -- nº da NFS-e (preenchido ao anexar/autorizar)
  competencia date NOT NULL,
  servico_id uuid REFERENCES fiscal_servicos(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  tomador jsonb NOT NULL,            -- congelado: {tipo:'PJ'|'PF', doc, nome, im, endereco, email, municipio, uf}
  valor_bruto numeric(14,2) NOT NULL CHECK (valor_bruto > 0),
  aliquota_iss numeric(5,4) NOT NULL,
  valor_iss numeric(14,2) NOT NULL,
  iss_retido boolean NOT NULL,
  valor_liquido numeric(14,2) NOT NULL,
  fechamento_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  conta_receber_id uuid REFERENCES financeiro_contas_a_receber(id) ON DELETE SET NULL,
  lancamento_iss_id uuid REFERENCES financeiro_lancamentos(id) ON DELETE SET NULL,
  pdf_storage_path text,
  xml_dps text,                      -- F2
  xml_nfse text,                     -- F2
  protocolo text,                    -- F2
  hash_dedupe text NOT NULL,         -- sha256(company|doc tomador|valor|competencia)
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_notas_dedupe
  ON fiscal_notas(hash_dedupe) WHERE status NOT IN ('cancelada','rejeitada');
CREATE INDEX IF NOT EXISTS idx_fiscal_notas_comp ON fiscal_notas(company_id, competencia DESC);

CREATE TABLE IF NOT EXISTS fiscal_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id uuid NOT NULL REFERENCES fiscal_notas(id) ON DELETE CASCADE,
  tipo text NOT NULL,                -- 'preparada','pdf_anexado','conta_criada','erro',… (F2: 'envio','retorno')
  detalhe jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS espelhando as tabelas financeiro_* da 109 (service key nos servidores; nega anon):
ALTER TABLE public.fiscal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.fiscal_config;
CREATE POLICY company_isolation ON public.fiscal_config
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid));

ALTER TABLE public.fiscal_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_servicos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.fiscal_servicos;
CREATE POLICY company_isolation ON public.fiscal_servicos
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid));

ALTER TABLE public.fiscal_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_notas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.fiscal_notas;
CREATE POLICY company_isolation ON public.fiscal_notas
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid));

ALTER TABLE public.fiscal_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_eventos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.fiscal_eventos;
CREATE POLICY company_isolation ON public.fiscal_eventos
  AS PERMISSIVE FOR ALL
  USING ((SELECT company_id FROM fiscal_notas WHERE id = nota_id) = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK ((SELECT company_id FROM fiscal_notas WHERE id = nota_id) = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid));

-- Seed EcoSun (idempotente):
INSERT INTO fiscal_config (cnpj, inscricao_municipal, razao_social)
SELECT '33.020.459/0001-06', '0790506200159', 'ECOSUNPOWER ENERGIA SOLAR LTDA'
WHERE NOT EXISTS (SELECT 1 FROM fiscal_config WHERE cnpj = '33.020.459/0001-06');

INSERT INTO fiscal_servicos (nome, cod_trib_nacional, nbs, descricao_padrao)
SELECT * FROM (VALUES
  ('Serviços elétricos gerais', '31.01.02', '1.1415.00.00', 'prestação de serviços eletricos gerais'),
  ('Manutenção e limpeza de geração FV', '14.01.01', '1.2001.60.00', 'serviços de manutenção preventiva em equipamentos de geração de energia e limpeza'),
  ('Instalação de sistema fotovoltaico (CONFIRMAR código com a contadora)', '07.02.01', NULL, 'execução de instalação de sistema de geração de energia solar fotovoltaica')
) AS v(nome, cod, nbs, descr)
WHERE NOT EXISTS (SELECT 1 FROM fiscal_servicos);
