-- supabase/migrations/040_fechamentos.sql
-- Tabela de fechamentos: cada execução do modo /fechar gera 1 linha.
-- dados_snapshot guarda DadosFechamento completo usado no render (rastreabilidade).
-- Veja docs/superpowers/specs/2026-05-26-eva-fechar-mvp-design.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  proposta_publica_id uuid REFERENCES propostas_publicas(id) ON DELETE SET NULL,

  docs_pedidos text[] NOT NULL,
  dados_snapshot jsonb NOT NULL,

  contrato_drive_id text,
  contrato_drive_link text,
  procuracao_drive_id text,
  procuracao_drive_link text,
  drive_folder_id text,

  status text NOT NULL DEFAULT 'gerado',

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fechamentos_status_check
    CHECK (status IN ('gerado', 'aprovado_junior', 'enviado_cliente', 'cancelado')),
  CONSTRAINT fechamentos_docs_check
    CHECK (cardinality(docs_pedidos) > 0)
);

CREATE INDEX IF NOT EXISTS idx_fechamentos_lead
  ON fechamentos(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fechamentos_status
  ON fechamentos(status, created_at DESC);

COMMENT ON TABLE fechamentos IS
  'Execuções do modo /fechar. dados_snapshot guarda DadosFechamento renderizado nos PDFs.';
COMMENT ON COLUMN fechamentos.created_by IS
  'Telefone do admin (Junior ou ADMIN_EXTRA_PHONES) que disparou o /fechar.';
