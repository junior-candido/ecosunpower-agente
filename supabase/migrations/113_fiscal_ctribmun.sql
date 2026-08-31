-- 113: cTribMun obrigatório na DPS (validador oficial da homologação, 31/08/2026).
-- O código de tributação municipal vem da tabela de correlação do ISS do município
-- (ISS.net DF: Downloads > Correlação Tributação Municipal x Nacional).
-- Na HOMOLOGAÇÃO (município de teste 5002704) as atividades de teste são 1/4/6/7.
ALTER TABLE fiscal_servicos ADD COLUMN IF NOT EXISTS cod_trib_municipal text;

-- Homologação: qualquer serviço sem código usa a atividade de teste 1 (2%) por enquanto;
-- ANTES de ir pra produção, preencher com o código REAL da correlação do DF.
UPDATE fiscal_servicos SET cod_trib_municipal = '1' WHERE cod_trib_municipal IS NULL;
