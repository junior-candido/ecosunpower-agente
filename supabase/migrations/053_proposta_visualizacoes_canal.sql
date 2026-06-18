-- 053_proposta_visualizacoes_canal.sql
-- Distingue se a visualização veio da página web (/p/:slug) ou do PDF (/p/:slug.pdf).
-- Default 'web' preserva o comportamento das linhas existentes.
ALTER TABLE proposta_visualizacoes
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'web';

COMMENT ON COLUMN proposta_visualizacoes.canal IS
  'Origem da visualização: web (página /p/:slug) ou pdf (/p/:slug.pdf).';
