-- Migration 145: posição (lat/lng) das usinas — Mapa das Usinas no Command Center.
--
-- A usina mora em sistemas_clientes (1 linha = 1 usina). Até aqui só havia
-- cidade/UF (e o endereço do dono em leads). O mapa precisa de um ponto:
--   lat, lng   — graus decimais (WGS84), NULL = ainda sem posição
--   geo_fonte  — de onde veio o ponto:
--                  'endereco' = achado pelo endereço (Nominatim/OpenStreetMap)
--                  'cidade'   = só o centro da cidade/bairro (aproximado)
--                  'api'      = a marca do inversor informou
--                  'manual'   = alguém arrastou o alfinete (NUNCA é sobrescrito
--                               pela localização automática)
--   geo_em     — quando o ponto foi gravado
--
-- Idempotente (pode rodar de novo). Não mexe em RLS: a tabela já tem RLS
-- forçado por empresa (079) e coluna nova herda as mesmas políticas.

ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS geo_fonte text,
  ADD COLUMN IF NOT EXISTS geo_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sistemas_clientes_geo_fonte_check') THEN
    ALTER TABLE sistemas_clientes
      ADD CONSTRAINT sistemas_clientes_geo_fonte_check
      CHECK (geo_fonte IS NULL OR geo_fonte IN ('endereco', 'cidade', 'manual', 'api'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sistemas_clientes_lat_lng_check') THEN
    ALTER TABLE sistemas_clientes
      ADD CONSTRAINT sistemas_clientes_lat_lng_check
      CHECK (
        (lat IS NULL AND lng IS NULL)
        OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
      );
  END IF;
END $$;

-- "Usinas sem posição" da empresa (ação Localizar e aviso do mapa).
CREATE INDEX IF NOT EXISTS idx_sistemas_clientes_sem_posicao
  ON sistemas_clientes (company_id)
  WHERE lat IS NULL AND ativo;

COMMENT ON COLUMN sistemas_clientes.lat IS 'Latitude da usina (WGS84). NULL = sem posição no mapa.';
COMMENT ON COLUMN sistemas_clientes.lng IS 'Longitude da usina (WGS84). NULL = sem posição no mapa.';
COMMENT ON COLUMN sistemas_clientes.geo_fonte IS
  'Origem do ponto: endereco | cidade (aproximado) | api (marca do inversor) | manual (alfinete arrastado — nunca sobrescrito automaticamente).';
COMMENT ON COLUMN sistemas_clientes.geo_em IS 'Quando lat/lng foram gravados.';
