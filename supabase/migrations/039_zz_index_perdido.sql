-- 039_zz_index_perdido.sql — segunda metade da 039 (split pro CI/banco zerado):
-- o índice parcial usa o valor 'perdido' criado na 039; transação separada (55P04).
-- Em produção a 039 original foi aplicada na mão — este arquivo é no-op lá.
create index if not exists idx_leads_lost
  on leads (lost_at desc)
  where status = 'perdido';
