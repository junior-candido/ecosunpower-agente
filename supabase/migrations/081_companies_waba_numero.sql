-- 081 — Mapa número WABA → empresa (alicerce da Fase 2 / tenant #2).
-- O webhook da Meta manda metadata.phone_number_id em cada mensagem; com este
-- mapa o sistema descobre DE QUAL empresa é a conversa (Trilho A do onboarding:
-- cada tenant ganha um número). NULL = número não mapeado (hoje: só a EcoSun).
alter table companies add column if not exists waba_phone_number_id text;
create unique index if not exists idx_companies_waba_numero
  on companies (waba_phone_number_id) where waba_phone_number_id is not null;
comment on column companies.waba_phone_number_id is
  'phone_number_id do número WABA da empresa (metadata do webhook da Meta). Único quando presente.';

-- EcoSun (tenant #1) será mapeada com o número atual quando a Eva multi-tenant
-- for ligada — por ora a coluna fica NULL e nada muda em produção.
