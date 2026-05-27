-- supabase/migrations/041_propostas_publicas_lead_id.sql
-- Cria FK propostas_publicas.lead_id pra vincular proposta ao lead correspondente.
-- Resolve bug Fase 1 do /fechar (Fernanda invisivel — proposta sem lead).
-- Veja docs/superpowers/specs/2026-05-27-eva-procuracao-contrato-rapidos-design.md secao 5.2

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_propostas_publicas_lead
  ON propostas_publicas(lead_id, created_at DESC);

COMMENT ON COLUMN propostas_publicas.lead_id IS
  'FK opcional pro lead criado/vinculado quando a proposta foi gerada. Backfill em 041b roda 1x.';
