-- supabase/migrations/099_servicos_lixeira.sql
-- Lixeira de serviços (pedido do Junior 05/08: excluir SEMPRE com desfazer).
-- Excluir = carimbar excluido_em (some das listas); restaurar = limpar o carimbo.
-- Nada é apagado de verdade — fotos/vídeos e status ficam intactos.

ALTER TABLE servicos ADD COLUMN IF NOT EXISTS excluido_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_servicos_lixeira ON servicos (excluido_em) WHERE excluido_em IS NOT NULL;
