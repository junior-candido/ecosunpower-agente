-- Migration 093: atribuição de serviços (F2 do Diário) — o Junior cria a
-- instalação e ATRIBUI pro instalador; ele vê "Meus serviços", completa as
-- fotos seguindo o guia e conclui (Junior recebe zap).
-- status: 'atribuido' (pendente com o instalador) | 'concluido' (default —
-- registros F1 preenchidos na hora já nascem/continuam concluídos).
-- Aplicar no SQL Editor ANTES do deploy. Número 093 combinado no grupo.

ALTER TABLE servicos ADD COLUMN IF NOT EXISTS atribuido_a uuid REFERENCES dashboard_users(id);
ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'concluido'
  CHECK (status IN ('atribuido', 'concluido'));

CREATE INDEX IF NOT EXISTS idx_servicos_atribuido ON servicos(atribuido_a) WHERE status = 'atribuido';
