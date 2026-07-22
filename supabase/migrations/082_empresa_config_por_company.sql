-- Migration 082: empresa_config MULTI-EMPRESA (Fase 2 fatia B1a — docs/ecosof/07)
-- A tabela era 1 linha (id=1, EcoSun). Agora cada empresa PODE ter a sua linha
-- de config (CNPJ/PIX/RT/marcas/textos) — é o que faz proposta/contrato/Eva
-- saírem com a marca do TENANT nas fatias B1b+.
-- Idempotente (roda 2x sem quebrar). Aditiva: NADA muda pro código atual.

-- 1) Coluna do dono (nullable durante a transição; a linha 1 vira da EcoSun).
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 2) A linha histórica (id=1) é da EcoSun.
UPDATE empresa_config
   SET company_id = '00000000-0000-0000-0000-000000000001'
 WHERE id = 1 AND company_id IS NULL;

-- 3) No máximo UMA config por empresa (linhas sem dono ficam fora do índice).
CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_config_company
  ON empresa_config (company_id) WHERE company_id IS NOT NULL;

-- Nota RLS: empresa_config segue FORA da política 079 de propósito — é lida
-- pelo SERVIÇO no boot/reload (config de identidade, não dado de cliente).
-- O isolamento de marca acontece no app: empresaDe(companyId) só devolve a
-- linha daquela empresa (miss = defaults EcoSun, nunca a marca de outro tenant).
