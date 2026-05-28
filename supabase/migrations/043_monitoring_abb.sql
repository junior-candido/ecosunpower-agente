-- Libera 'abb' no enum de marca_inversor da tabela sistemas_clientes.
-- Adapter Aurora Vision (FIMER/ABB) implementado em src/modules/monitoring/adapters/abb.ts.
--
-- Por que migration nova: o CHECK constraint da migration 021 enumerava as
-- marcas suportadas. Como adicionamos 'abb' agora, precisamos relaxar o CHECK
-- (drop + recreate). Migrations sao append-only — nao editamos a 021.
--
-- ANTES DE APLICAR (Supabase SQL Editor):
-- Confirmar que o nome do constraint bate. Postgres usa por padrao
-- '<tabela>_<coluna>_check' mas algumas tools sufixam '_check1'.
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'sistemas_clientes'::regclass AND contype = 'c';
-- Se aparecer 'sistemas_clientes_marca_inversor_check' (esperado), pode rodar.
-- Se aparecer outro nome, ajustar o DROP abaixo antes.

ALTER TABLE sistemas_clientes DROP CONSTRAINT IF EXISTS sistemas_clientes_marca_inversor_check;
ALTER TABLE sistemas_clientes ADD CONSTRAINT sistemas_clientes_marca_inversor_check
  CHECK (marca_inversor IN (
    'solaredge', 'sungrow', 'deye', 'hoymiles', 'goodwe', 'huawei', 'foxess', 'nep', 'abb'
  ));
