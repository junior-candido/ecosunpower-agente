-- Migration 055: foto do hero nos posts do blog
-- Guarda a URL da foto (Pexels) escolhida na geração + o texto alternativo.
-- Na publicação, a imagem é baixada e commitada em public/blog/<slug>.<ext> no
-- repo do site, e o heroImage (caminho local) é injetado no frontmatter.
-- Ambas opcionais: sem PEXELS_API_KEY o post sai sem foto (como antes).

ALTER TABLE blog_drafts
  ADD COLUMN IF NOT EXISTS hero_image_url text,
  ADD COLUMN IF NOT EXISTS hero_image_alt text;

COMMENT ON COLUMN blog_drafts.hero_image_url IS 'URL Pexels da foto do hero (baixada e commitada no site na publicacao). NULL = post sem foto.';
COMMENT ON COLUMN blog_drafts.hero_image_alt IS 'Texto alternativo (PT) da foto do hero, pra acessibilidade/SEO.';
