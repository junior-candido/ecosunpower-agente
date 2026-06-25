-- Migration 060: etapa_obra em sistemas_clientes (Fase 3 — Operação)
--
-- Registra em qual etapa da obra cada usina se encontra.
-- Os valores espelham EtapaUsinaSlug de src/modules/usina-etapas.ts.

ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS etapa_obra TEXT NOT NULL DEFAULT 'projeto'
    CHECK (etapa_obra IN (
      'projeto','aprovacao','instalacao','vistoria','homologacao','operacao'
    ));

COMMENT ON COLUMN sistemas_clientes.etapa_obra IS
  'Etapa atual da obra: projeto→aprovacao→instalacao→vistoria→homologacao→operacao. Ver src/modules/usina-etapas.ts.';

-- Data/hora da última mudança de etapa (usado pelo kanban para exibir "há X dias").
-- DEFAULT now() inicializa com a data de aplicação da migration.
ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS etapa_obra_updated_at TIMESTAMPTZ DEFAULT now();

-- Índice parcial: só usinas ativas (as que aparecem no dashboard por etapa)
CREATE INDEX IF NOT EXISTS idx_sistemas_etapa_obra
  ON sistemas_clientes(etapa_obra) WHERE ativo;
