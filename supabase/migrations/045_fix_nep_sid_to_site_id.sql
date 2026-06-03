-- Migration 045: Fix duplicata NEP + padroniza site_id no JSONB
--
-- Mesmo bug da migration 023 (Deye), agora no NEP: o adapter salvava o id da
-- planta como `sid`, mas service.ts deduplica por `api_credentials->>site_id`.
-- Resultado: o cron de descoberta (1x/h) nunca achava match → INSERT → duplicava
-- cada planta NEP a cada hora (~460 cópias). Cada cópia nasce sem geração →
-- vira "sem geração há 7 dias" → enxurrada de alertas falsos de offline.
--
-- ORDEM IMPORTA: as linhas NEP hoje têm `sid` (não `site_id`). O índice único
-- `uq_sistemas_clientes_marca_site_id` (criado na 023, WHERE api_credentials ?
-- 'site_id') só cobre quem tem `site_id`. Por isso:
--   1. Apaga duplicatas agrupando por `sid` (o que as linhas NEP têm AGORA).
--   2. SÓ DEPOIS faz backfill sid -> site_id nas sobreviventes (já únicas por
--      planta), evitando violar o índice único ao gravar o mesmo site_id 2x.
-- Após isso, as plantas NEP entram no índice único e o banco passa a barrar
-- duplicata sozinho — mesma proteção que o Deye já tem.

-- =========================================================================
-- 1. Deleta duplicatas NEP: mantém a mais antiga (created_at menor) por
--    (marca_inversor, sid). Cascade deleta geracao_diaria/monitoring_alerts.
--    A mais antiga é a planta original (tem o histórico de geração); as cópias
--    foram criadas pelo cron e estão vazias.
-- =========================================================================
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY marca_inversor, api_credentials->>'sid'
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM sistemas_clientes
  WHERE marca_inversor = 'nep'
    AND api_credentials ? 'sid'
)
DELETE FROM sistemas_clientes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- =========================================================================
-- 2. Backfill sid -> site_id nas sobreviventes (agora únicas por planta).
--    Remove `sid`, adiciona `site_id` com o mesmo valor. Isso as coloca sob o
--    índice único uq_sistemas_clientes_marca_site_id (proteção definitiva).
-- =========================================================================
UPDATE sistemas_clientes
SET api_credentials = (api_credentials - 'sid') || jsonb_build_object('site_id', api_credentials->>'sid')
WHERE marca_inversor = 'nep'
  AND api_credentials ? 'sid'
  AND NOT (api_credentials ? 'site_id');
