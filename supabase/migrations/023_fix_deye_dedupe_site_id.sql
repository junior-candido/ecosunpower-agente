-- Migration 023: Fix duplicata Deye + padroniza site_id no JSONB
--
-- Bug: adapter Deye salvava stationId (camelCase) em api_credentials, mas o
-- service.ts busca por site_id (snake_case) pra decidir UPDATE vs INSERT.
-- Resultado: import Deye sempre fazia INSERT (nunca achava match), duplicava
-- planta a cada chamada.
--
-- Fix:
--   1. Migra api_credentials.stationId -> api_credentials.site_id em registros existentes
--   2. Remove duplicatas (mantem o mais antigo, que tem geracao_diaria associada se tiver)
--   3. Cria UNIQUE index em (marca_inversor, api_credentials->>'site_id')
--      pra prevenir o bug pra qualquer adapter futuro

-- =========================================================================
-- 1. Migra stationId -> site_id no JSONB
-- =========================================================================
UPDATE sistemas_clientes
SET api_credentials = (api_credentials - 'stationId') || jsonb_build_object('site_id', api_credentials->>'stationId')
WHERE marca_inversor = 'deye'
  AND api_credentials ? 'stationId'
  AND NOT (api_credentials ? 'site_id');

-- =========================================================================
-- 2. Deleta duplicatas: mantem o mais antigo (created_at menor) por
--    (marca_inversor, site_id). Cascade deleta geracao_diaria/alertas tambem.
-- =========================================================================
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY marca_inversor, api_credentials->>'site_id'
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM sistemas_clientes
  WHERE api_credentials ? 'site_id'
)
DELETE FROM sistemas_clientes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- =========================================================================
-- 3. UNIQUE index pra prevenir duplicata futura (qualquer adapter)
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_sistemas_clientes_marca_site_id
  ON sistemas_clientes (marca_inversor, (api_credentials->>'site_id'))
  WHERE api_credentials ? 'site_id';

COMMENT ON INDEX uq_sistemas_clientes_marca_site_id IS
  'Garante 1 sistema por (marca + site_id externo). Adapter DEVE salvar site_id no JSONB.';
