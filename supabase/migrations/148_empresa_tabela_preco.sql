-- supabase/migrations/148_empresa_tabela_preco.sql
-- Tabela de preço e potência do módulo POR EMPRESA (30/09/2026, caso Conquista Solar).
--
-- Antes a estimativa do lead (aviso de handoff pra quem vai fechar) usava a
-- tabela de R$/Wp da EcoSun fixa no código — a vendedora de outra empresa
-- recebia o preço do Junior. Agora:
--   tabela_preco_wp  = pares [kWp, R$/Wp] em ordem de kWp (interpola entre eles)
--   wp_por_painel    = potência do módulo que a empresa vende (Wp)
-- NULL = sem tabela: a EcoSun continua com a de código; tenant fica SEM preço
-- na estimativa (nunca herda o de outra empresa). Nada muda pra EcoSun.

ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS tabela_preco_wp jsonb;
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS wp_por_painel integer
  CHECK (wp_por_painel IS NULL OR (wp_por_painel BETWEEN 100 AND 1500));

COMMENT ON COLUMN empresa_config.tabela_preco_wp IS
  'Pares [kWp, R$/Wp] em ordem crescente, ex.: [[3,3.2],[5,2.71],[10,2.36]]. NULL = sem tabela (tenant sai sem preço na estimativa).';
COMMENT ON COLUMN empresa_config.wp_por_painel IS
  'Potência (Wp) do módulo que a empresa vende. NULL = 670.';

-- Exemplo (NÃO roda — preencher quando a empresa mandar a tabela):
-- UPDATE empresa_config
--    SET tabela_preco_wp = '[[3,3.20],[5,2.71],[10,2.36],[20,2.20]]'::jsonb,
--        wp_por_painel = 610
--  WHERE company_id = '<id da empresa>';
