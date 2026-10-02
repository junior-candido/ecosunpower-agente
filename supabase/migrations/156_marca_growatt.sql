-- supabase/migrations/156_marca_growatt.sql
-- Conector GROWATT (OpenAPI oficial com token — 02/10/2026). Só MONITORAMENTO
-- de usinas existentes (carteira de empresas clientes, ex.: Conquista Solar).
-- A EcoSun continua sem vender Growatt.
ALTER TABLE sistemas_clientes DROP CONSTRAINT IF EXISTS sistemas_clientes_marca_inversor_check;
ALTER TABLE sistemas_clientes ADD CONSTRAINT sistemas_clientes_marca_inversor_check
  CHECK (marca_inversor IN (
    'solaredge', 'sungrow', 'deye', 'hoymiles', 'goodwe', 'huawei', 'foxess', 'nep', 'abb', 'solis', 'saj', 'growatt'
  ));

SELECT pg_get_constraintdef(oid) AS regra FROM pg_constraint WHERE conname = 'sistemas_clientes_marca_inversor_check';
