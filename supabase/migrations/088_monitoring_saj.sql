-- Libera 'saj' no enum de marca_inversor da tabela sistemas_clientes.
-- Adapter elekeeper (portal SAJ internacional) em
-- src/modules/monitoring/adapters/saj.ts — login username+senha do instalador.
-- Motivação: carteira SunBright/Thiago tem 85 plantas SAJ (maior marca dele).
--
-- Por que migration nova: o CHECK constraint (021, atualizado na 043/064)
-- enumera as marcas suportadas. Migrations sao append-only — nao editamos
-- as anteriores.
--
-- ANTES DE APLICAR (Supabase SQL Editor): confirmar o nome do constraint:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'sistemas_clientes'::regclass AND contype = 'c';
-- Esperado 'sistemas_clientes_marca_inversor_check'. Se for outro, ajustar o DROP.

ALTER TABLE sistemas_clientes DROP CONSTRAINT IF EXISTS sistemas_clientes_marca_inversor_check;
ALTER TABLE sistemas_clientes ADD CONSTRAINT sistemas_clientes_marca_inversor_check
  CHECK (marca_inversor IN (
    'solaredge', 'sungrow', 'deye', 'hoymiles', 'goodwe', 'huawei', 'foxess', 'nep', 'abb', 'solis', 'saj'
  ));
