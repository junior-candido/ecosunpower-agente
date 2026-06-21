-- Histórico dos posts de marketing pra anti-repetição (sobrevive a restart do app).
-- topic_type: qual dos 6 tipos de post foi gerado.
-- scene_key: qual cena visual (solar-scenes) o Higgsfield usou (null em post de vídeo).
alter table marketing_drafts
  add column if not exists topic_type text,
  add column if not exists scene_key text;
