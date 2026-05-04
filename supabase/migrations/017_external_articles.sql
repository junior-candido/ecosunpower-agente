-- 017_external_articles.sql
-- Notícias externas raspadas de fontes setoriais (ANEEL etc) pra alimentar
-- o blog generator. Dedup por external_url. Quando blog gera draft novo,
-- lê últimos N artigos relevantes e cruza com fontes ja em conhecimento/
-- (ex: canal-solar.md) — Claude decide tema novo evitando repetir drafts
-- antigos da tabela blog_drafts.

CREATE TABLE IF NOT EXISTS public.external_articles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text        NOT NULL,                 -- 'aneel' | 'portal_solar' | 'absolar' | etc
  external_url  text        UNIQUE NOT NULL,
  title         text        NOT NULL,
  summary       text,                                  -- preview da listagem (curto)
  content       text,                                  -- corpo completo se baixado
  published_at  timestamptz,                           -- data declarada pela fonte
  scraped_at    timestamptz NOT NULL DEFAULT now(),
  keywords      text[]      DEFAULT '{}',              -- tags extraidas/atribuidas
  is_relevant   boolean     DEFAULT true,              -- false = filtrado fora (off-topic)
  used_in_blog  text[]      DEFAULT '{}'               -- ids de blog_drafts que usaram
);

CREATE INDEX IF NOT EXISTS idx_external_articles_source_pub
  ON public.external_articles (source, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_external_articles_scraped
  ON public.external_articles (scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_articles_relevant
  ON public.external_articles (is_relevant)
  WHERE is_relevant = true;

COMMENT ON TABLE public.external_articles IS 'Notícias externas raspadas (ANEEL, Portal Solar, etc) pra blog generator';
COMMENT ON COLUMN public.external_articles.source IS 'Identificador da fonte (slug curto, ex: aneel)';
COMMENT ON COLUMN public.external_articles.is_relevant IS 'False quando filtrado por keywords off-topic — mantemos pra audit';
COMMENT ON COLUMN public.external_articles.used_in_blog IS 'IDs de blog_drafts que ja usaram este artigo (evita repetir)';
