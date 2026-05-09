-- Migration 024: Limpa duplicatas remanescentes + UNIQUE INDEX a prova de balas
--
-- Problema: migration 023 criou UNIQUE INDEX com WHERE api_credentials ? 'site_id'.
-- Isso nao pega registros antigos que ainda tem 'stationId' (camelCase) e nao
-- 'site_id'. Resultado: imports feitos com codigo antigo (bb45f33) duplicaram
-- de novo apesar do UNIQUE INDEX existir.
--
-- Fix:
--   1. Migra stationId -> site_id em qualquer registro pendente (idempotente)
--   2. Deleta novas duplicatas (mantem mais antigo)
--   3. Re-cria UNIQUE INDEX usando COALESCE pra cobrir AMBOS os formatos
--      (mesmo que adapter futuro salve em outro campo, eh mais robusto)

-- =========================================================================
-- 1. Migra stationId -> site_id (idempotente — so faz se ainda nao migrou)
-- =========================================================================
UPDATE sistemas_clientes
SET api_credentials = (api_credentials - 'stationId') || jsonb_build_object('site_id', api_credentials->>'stationId')
WHERE api_credentials ? 'stationId'
  AND NOT (api_credentials ? 'site_id');

-- =========================================================================
-- 2. Deleta duplicatas remanescentes (caso import duplicou apos migration 023)
-- =========================================================================
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY marca_inversor, COALESCE(api_credentials->>'site_id', api_credentials->>'stationId')
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM sistemas_clientes
  WHERE COALESCE(api_credentials->>'site_id', api_credentials->>'stationId') IS NOT NULL
)
DELETE FROM sistemas_clientes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- =========================================================================
-- 3. Drop indice antigo (limitado) e cria novo com COALESCE robusto
-- =========================================================================
DROP INDEX IF EXISTS uq_sistemas_clientes_marca_site_id;

CREATE UNIQUE INDEX uq_sistemas_clientes_marca_site_id
  ON sistemas_clientes (
    marca_inversor,
    COALESCE(api_credentials->>'site_id', api_credentials->>'stationId')
  )
  WHERE COALESCE(api_credentials->>'site_id', api_credentials->>'stationId') IS NOT NULL;

COMMENT ON INDEX uq_sistemas_clientes_marca_site_id IS
  'Garante 1 sistema por (marca + site_id). COALESCE cobre site_id (novo) e stationId (legado camelCase).';
