-- supabase/migrations/042_fechamentos_parent_id.sql
-- Adiciona coluna parent_id pra rastrear versoes geradas via [Refazer].
-- v1=parent_id null. v2 aponta pra v1, v3 pra v2, etc.

ALTER TABLE fechamentos
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fechamentos_parent
  ON fechamentos(parent_id);

COMMENT ON COLUMN fechamentos.parent_id IS
  'FK opcional pro fechamento anterior em caso de [Refazer]. Permite rastrear historico de versoes.';
