-- Migration 015: blog_drafts table for auto-blog system
-- Drafts gerados a cada 3 dias pela Eva, aprovados por Junior via WhatsApp.
-- Quando aprovado, o publish-via-github-api commita no repo do site.

CREATE TABLE IF NOT EXISTS blog_drafts (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('tecnico','tecnologia','mercado','regulacao','casos','tutorial')),
  tags text[] NOT NULL DEFAULT '{}',
  content_md text NOT NULL,
  reading_time int NOT NULL DEFAULT 8,
  source_attribution text,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','published','discarded','failed')),

  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  published_at timestamptz,
  discarded_at timestamptz,
  discarded_reason text,
  failed_reason text,

  -- Tracking
  github_commit_sha text,
  github_commit_url text,
  whatsapp_notified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_blog_drafts_status ON blog_drafts(status, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_drafts_category ON blog_drafts(category, generated_at DESC);

COMMENT ON TABLE blog_drafts IS 'Drafts de posts pro blog ecosunpower.eng.br, fluxo: pending -> approved (via zap) -> published (via GitHub API)';
COMMENT ON COLUMN blog_drafts.status IS 'pending=aguardando Junior aprovar via zap; approved=aprovado mas ainda nao publicado; published=ja commitado no repo do site; discarded=Junior rejeitou; failed=erro tecnico';
