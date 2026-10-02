-- supabase/migrations/155_sistemas_arranjos.sql
-- MULTI-ARRANJO (Energy Studio — 02/10/2026): usina com mais de uma água do
-- telhado (ex.: metade leste, metade oeste). Lista de arranjos, cada um com a
-- própria potência, orientação e inclinação. Vazio/nulo = usa os campos únicos
-- de sempre (telhado_orientacao / telhado_inclinacao_graus).
--
-- Formato: [{"nome":"Bloco A oeste","kwp":2.86,"azimute":280,"inclinacao":10}, ...]
--   azimute em graus (0 = Norte, 90 = Leste, 180 = Sul, 270 = Oeste)

ALTER TABLE sistemas_clientes ADD COLUMN IF NOT EXISTS arranjos jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sistemas_arranjos_e_lista') THEN
    ALTER TABLE sistemas_clientes
      ADD CONSTRAINT sistemas_arranjos_e_lista CHECK (arranjos IS NULL OR jsonb_typeof(arranjos) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN sistemas_clientes.arranjos IS
  'Multi-arranjo (Previsto × Real): [{nome,kwp,azimute(0=N,90=L),inclinacao}]. Nulo = orientação única do cadastro.';

SELECT count(*) FILTER (WHERE arranjos IS NOT NULL) AS usinas_multi_arranjo FROM sistemas_clientes;
