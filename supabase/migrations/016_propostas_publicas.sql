-- Migration 016: propostas_publicas
-- Hospeda HTML das propostas geradas pela Eva pra acesso publico via slug aleatorio.
-- URL: https://propostas.ecosunpower.eng.br/p/<slug>
-- Resolve a limitacao do Drive desktop que abre HTML como codigo fonte
-- e elimina dependencia de DLP do Workspace pra link publico.

-- pgcrypto fornece gen_random_uuid(). Vem habilitado por padrao em projetos
-- Supabase novos, mas garantimos pra projetos antigos / outros ambientes.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS propostas_publicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  numero_proposta text NOT NULL,
  cliente_nome text NOT NULL,
  cliente_telefone text,
  html_content text NOT NULL,
  dados_input jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),

  acessos int NOT NULL DEFAULT 0,
  ultimo_acesso_at timestamptz,

  -- Revogacao manual (ex: cliente pediu pra apagar, dados errados detectados)
  revoked boolean NOT NULL DEFAULT false,
  revoked_reason text
);

-- Lookup principal: slug ativo (nao revogado).
-- Filtro de expiracao fica no app pra retornar 410 Gone com mensagem amigavel.
CREATE INDEX IF NOT EXISTS idx_propostas_publicas_slug
  ON propostas_publicas(slug)
  WHERE NOT revoked;

-- Listagem por cliente pro Junior procurar propostas antigas.
CREATE INDEX IF NOT EXISTS idx_propostas_publicas_cliente
  ON propostas_publicas(cliente_nome, created_at DESC);

-- Pra futuro cron de limpeza de expiradas (DELETE WHERE expires_at < now()).
CREATE INDEX IF NOT EXISTS idx_propostas_publicas_expires
  ON propostas_publicas(expires_at)
  WHERE NOT revoked;

COMMENT ON TABLE propostas_publicas IS 'HTML publico das propostas geradas pela Eva (/proposta). Acessado via /p/:slug com TTL de 60 dias.';
COMMENT ON COLUMN propostas_publicas.slug IS 'Token urlsafe aleatorio de 10 chars (nao enumeravel). Ex: x7Kq2pL9aB';
COMMENT ON COLUMN propostas_publicas.expires_at IS 'Apos essa data, /p/:slug retorna 410 Gone.';
COMMENT ON COLUMN propostas_publicas.revoked IS 'Marcacao manual pra revogar acesso antes do expires_at.';
