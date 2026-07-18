-- 0800_splits_de_enum_pos_criacao.sql — segundas metades das migrations 033 e 039.
-- Postgres proíbe USAR um valor de enum na MESMA transação que o criou (55P04),
-- e o rastreador do supabase CLI exige número único por arquivo — por isso os
-- trechos moram aqui, num número alto (roda depois de tudo; antes de futuras 080_+
-- pela ordenação lexicográfica "0800" < "080_").
-- Em PRODUÇÃO as migrations originais foram aplicadas na mão: tudo aqui é no-op
-- (idempotente: update sem linhas + create index if not exists).

-- da 033: backfill agronegocio -> rural (banco zerado: 0 linhas)
update leads set profile = 'rural'::lead_profile where profile = 'agronegocio'::lead_profile;

-- da 039: índice parcial dos perdidos
create index if not exists idx_leads_lost
  on leads (lost_at desc)
  where status = 'perdido';
