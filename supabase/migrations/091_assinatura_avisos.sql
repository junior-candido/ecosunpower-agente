-- Migration 091: assinatura_avisos — registro de cada aviso do motor de
-- mensalidades (fatia 2). UNIQUE (assinatura, tipo, ciclo) = idempotência:
-- o cron pode rodar 2x no dia que não avisa 2x. ciclo = vence_em do momento.
-- Aplicar no SQL Editor (projeto prod kupnsoyymulbdzakqlqc) ANTES do deploy.
-- ⚠️ Combinar o número 091 no grupo (append-only).

CREATE TABLE IF NOT EXISTS assinatura_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id uuid NOT NULL REFERENCES assinaturas(id),
  company_id uuid REFERENCES companies(id),  -- cópia da assinatura (RLS/relatórios)
  tipo text NOT NULL CHECK (tipo IN ('aviso8', 'aviso2', 'ultimo', 'travou')),
  ciclo date NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assinatura_id, tipo, ciclo)
);

CREATE INDEX IF NOT EXISTS idx_assinatura_avisos_assinatura ON assinatura_avisos(assinatura_id);

ALTER TABLE assinatura_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_avisos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON assinatura_avisos;
CREATE POLICY company_isolation ON assinatura_avisos
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
