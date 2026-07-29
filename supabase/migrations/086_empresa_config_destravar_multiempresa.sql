-- 086: destrava empresa_config pra multi-empresa DE VERDADE.
-- A 049 criou a tabela single-row (id int PK DEFAULT 1 CHECK (id = 1)) e a 082
-- (multi-empresa) adicionou company_id + índice único, mas ESQUECEU de remover
-- a trava — nenhum tenant conseguia ter linha própria (INSERT estourava a PK
-- id=1). Descoberto 28/07 ao criar a config da SunBright (régua 60%).
-- Idempotente (roda 2x sem quebrar).
alter table empresa_config drop constraint if exists empresa_config_id_check;
alter table empresa_config alter column id drop default;
create sequence if not exists empresa_config_id_seq owned by empresa_config.id;
select setval('empresa_config_id_seq', (select coalesce(max(id), 1) from empresa_config));
alter table empresa_config alter column id set default nextval('empresa_config_id_seq');
