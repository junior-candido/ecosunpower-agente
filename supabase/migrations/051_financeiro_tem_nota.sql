-- 051_financeiro_tem_nota.sql
-- Peça 2: entrada "sem nota" = caixa apenas, fora do imposto.
-- Default true => todo o histórico e o caminho padrão continuam "com nota".
ALTER TABLE financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS tem_nota boolean NOT NULL DEFAULT true;
