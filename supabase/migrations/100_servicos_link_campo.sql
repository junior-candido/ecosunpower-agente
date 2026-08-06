-- supabase/migrations/100_servicos_link_campo.sql
-- LINK MÁGICO do serviço (Junior 06/08): campo trabalha por link secreto com
-- validade — SEM usuário, SEM senha, SEM trava. O nome de quem faz fica
-- registrado no próprio serviço. Mata o "acesso temporário" (fonte dos clones).

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS campo_slug text UNIQUE,        -- o link secreto (10 letras)
  ADD COLUMN IF NOT EXISTS campo_expira_em timestamptz,   -- validade que o Junior define em dias
  ADD COLUMN IF NOT EXISTS campo_nome text;               -- quem vai fazer (só o nome, sem cadastro)

CREATE INDEX IF NOT EXISTS idx_servicos_campo_slug ON servicos (campo_slug) WHERE campo_slug IS NOT NULL;
