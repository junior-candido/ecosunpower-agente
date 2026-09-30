-- supabase/migrations/149_empresa_gd_emails_origem.sql
-- Demonstrativo de GD POR EMPRESA (30/09/2026, caso Conquista Solar).
--
-- O demonstrativo da distribuidora chega pelo encaminhamento automático do
-- Gmail da empresa, que preserva o To ORIGINAL: o e-mail que a empresa
-- cadastrou na distribuidora. Aqui cada empresa lista esses e-mails; o
-- demonstrativo cujo To casar com a lista de UMA empresa é dela.
-- Lista vazia (padrão) = nada muda: sem cadastro que case, o demonstrativo
-- fica com a EcoSun, exatamente como antes.

ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS gd_emails_origem text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN empresa_config.gd_emails_origem IS
  'E-mails da empresa cadastrados na distribuidora (recebem o demonstrativo de GD). O To original do e-mail encaminhado casa com esta lista.';

-- Exemplo (NÃO roda — preencher com o e-mail real da empresa):
-- UPDATE empresa_config
--    SET gd_emails_origem = ARRAY['projetos@empresa.com.br']
--  WHERE company_id = '<id da empresa>';
