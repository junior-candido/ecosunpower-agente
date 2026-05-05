-- 018_proposta_attachments.sql
-- Anexos (fotos + video) de proposta personalizada.

CREATE TABLE IF NOT EXISTS proposta_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_slug TEXT NOT NULL REFERENCES propostas_publicas(slug) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('foto', 'video')),
  ordem SMALLINT NOT NULL CHECK (ordem >= 1 AND ordem <= 3),
  legenda TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_slug_tipo_ordem UNIQUE (proposta_slug, tipo, ordem)
);

CREATE INDEX IF NOT EXISTS idx_attachments_slug ON proposta_attachments(proposta_slug);

-- Adiciona campo tipo na tabela existente pra distinguir basica/personalizada
ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'basica' CHECK (tipo IN ('basica', 'personalizada'));
