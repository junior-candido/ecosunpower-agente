-- 112: F2 fiscal — emissão automática (ambiente, numeração da DPS, chave de acesso)
ALTER TABLE fiscal_config
  ADD COLUMN IF NOT EXISTS ambiente text NOT NULL DEFAULT 'homologacao'
    CHECK (ambiente IN ('homologacao','producao')),
  ADD COLUMN IF NOT EXISTS serie_dps text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS proximo_ndps bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cod_municipio text NOT NULL DEFAULT '5300108';

ALTER TABLE fiscal_notas
  ADD COLUMN IF NOT EXISTS chave_acesso text,
  ADD COLUMN IF NOT EXISTS ambiente_emissao text
    CHECK (ambiente_emissao IN ('homologacao','producao'));

-- numeração atômica da DPS (uma linha por empresa em fiscal_config)
CREATE OR REPLACE FUNCTION fiscal_proximo_ndps(p_company uuid)
RETURNS bigint LANGUAGE sql AS $$
  UPDATE fiscal_config SET proximo_ndps = proximo_ndps + 1, updated_at = now()
  WHERE company_id = p_company
  RETURNING proximo_ndps - 1;
$$;

-- bucket privado pro certificado A1 cifrado
INSERT INTO storage.buckets (id, name, public) VALUES ('fiscal-certificados', 'fiscal-certificados', false)
ON CONFLICT (id) DO NOTHING;
