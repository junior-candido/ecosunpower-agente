-- supabase/migrations/066_resumo_diario_pos_venda.sql
-- Resumo diário do pós-venda no zap: marca de "já mandei hoje" (porteiro CAS).
-- Spec: docs/superpowers/specs/2026-07-02-pos-venda-resumo-diario-design.md
ALTER TABLE monitoring_config
  ADD COLUMN IF NOT EXISTS resumo_diario_enviado_em timestamptz;
