-- Migration 107: instância Evolution API por empresa (tenant via QR code, sem Meta)
-- Caso: Conquista Solar (Clara) conecta o número 77 99961-0038 por QR na MESMA
-- Evolution API da Eva, numa instância própria (ex.: 'conquista-solar').
-- O webhook da Evolution manda `instance` no payload → aqui vira company_id.
-- Aditiva e idempotente. SEM mapeamento cadastrado, nada muda (tudo = EcoSun).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS evolution_instance text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_evolution_instance
  ON companies (evolution_instance) WHERE evolution_instance IS NOT NULL;

COMMENT ON COLUMN companies.evolution_instance IS
  'Nome da instância na Evolution API que atende esta empresa (webhook body.instance). NULL = empresa não usa Evolution própria (EcoSun usa EVOLUTION_INSTANCE do env).';
