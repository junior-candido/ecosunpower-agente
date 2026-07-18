-- 033_zz_backfill_rural.sql — segunda metade da 033 (split pro CI/banco zerado):
-- o UPDATE usa o valor 'rural' criado na 033; Postgres exige transação separada
-- (55P04). Em produção a 033 original foi aplicada na mão — este arquivo é no-op lá.
update leads set profile = 'rural'::lead_profile where profile = 'agronegocio'::lead_profile;
