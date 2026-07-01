-- Libera 'solis' no enum de marca_inversor da tabela sistemas_clientes.
-- Adapter SolisCloud (API oficial, KeyId+KeySecret+HMAC) em
-- src/modules/monitoring/adapters/solis.ts.
--
-- Por que migration nova: o CHECK constraint (021, atualizado na 043) enumera as
-- marcas suportadas. Como adicionamos 'solis' agora, relaxamos o CHECK
-- (drop + recreate). Migrations sao append-only — nao editamos as anteriores.
--
-- ANTES DE APLICAR (Supabase SQL Editor): confirmar o nome do constraint:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'sistemas_clientes'::regclass AND contype = 'c';
-- Esperado 'sistemas_clientes_marca_inversor_check'. Se for outro, ajustar o DROP.

ALTER TABLE sistemas_clientes DROP CONSTRAINT IF EXISTS sistemas_clientes_marca_inversor_check;
ALTER TABLE sistemas_clientes ADD CONSTRAINT sistemas_clientes_marca_inversor_check
  CHECK (marca_inversor IN (
    'solaredge', 'sungrow', 'deye', 'hoymiles', 'goodwe', 'huawei', 'foxess', 'nep', 'abb', 'solis'
  ));
