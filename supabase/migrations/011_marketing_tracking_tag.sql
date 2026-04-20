-- Migration 011: rastreamento de tag em posts de marketing
-- Cada post organico gera um wa.me com tag #post-XXXXXX. Armazenamos a tag
-- pra depois cruzar com leads.utm_content e saber qual post trouxe cada lead.

alter table marketing_drafts add column if not exists tracking_tag text;

-- Unique partial index pra evitar colisao acidental de tracking_tag entre drafts.
-- Se houver colisao (MUITO improvavel com randomBytes), INSERT da 23505 e
-- o caller faz retry com novo id.
create unique index if not exists idx_marketing_drafts_tracking_unique
  on marketing_drafts(tracking_tag) where tracking_tag is not null;
