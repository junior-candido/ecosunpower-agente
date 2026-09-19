-- 128_empresa_modulos.sql
--
-- QUEM CONTRATOU O QUE. Ate hoje isso nao existia em lugar nenhum: o codigo
-- presumia que toda empresa tinha todo modulo ligado. Em 18/09/2026 a conta
-- chegou — a regua de e-mail varreu a base inteira, pegou 6 leads da Conquista
-- Solar (que contratou SOMENTE a Eva) e mandou 16 e-mails com a marca da
-- EcoSunPower. Um deles foi parar no financeiro da propria Conquista.
--
-- A partir daqui, automacao nenhuma dispara sem perguntar se a empresa dona do
-- dado contratou aquele modulo. A resposta padrao e NAO: modulo ausente da
-- tabela = desligado. Empresa nova entra sem nada ligado e o dono liga o que
-- vendeu — em vez de entrar com tudo ligado e alguem lembrar de desligar.

create table if not exists empresa_modulos (
  company_id     uuid        not null references companies(id) on delete cascade,
  modulo         text        not null,
  ativo          boolean     not null default false,
  contratado_em  date,
  observacao     text,
  updated_at     timestamptz not null default now(),
  primary key (company_id, modulo)
);

comment on table empresa_modulos is
  'Modulos contratados por empresa. Ausencia da linha = modulo DESLIGADO. Consultado por toda automacao antes de tocar dado do tenant.';
comment on column empresa_modulos.modulo is
  'eva | email | pasta_digital | monitoramento | financeiro | fiscal | rh | marketing | medicao';

create index if not exists empresa_modulos_ativos_idx
  on empresa_modulos (modulo) where ativo;

alter table empresa_modulos enable row level security;

drop policy if exists empresa_modulos_isolamento on empresa_modulos;
create policy empresa_modulos_isolamento on empresa_modulos
  for all
  using (company_id = current_setting('request.company_id', true)::uuid)
  with check (company_id = current_setting('request.company_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- Estado de hoje, 18/09/2026.
-- EcoSunPower usa a plataforma inteira. Conquista Solar contratou so a Eva.
-- ---------------------------------------------------------------------------
insert into empresa_modulos (company_id, modulo, ativo, contratado_em, observacao)
select c.id, m.modulo, true, current_date, 'estado existente, migration 128'
  from companies c
 cross join (values
   ('eva'), ('email'), ('pasta_digital'), ('monitoramento'),
   ('financeiro'), ('fiscal'), ('rh'), ('marketing'), ('medicao')
 ) as m(modulo)
 where c.nome = 'EcoSunPower'
on conflict (company_id, modulo) do nothing;

insert into empresa_modulos (company_id, modulo, ativo, contratado_em, observacao)
select c.id, 'eva', true, current_date, 'contrato Conquista: somente a assistente'
  from companies c
 where c.nome = 'Conquista Solar'
on conflict (company_id, modulo) do nothing;

-- As demais empresas (Rodrigues&cor, SunBright) entram sem nenhum modulo ligado.
-- E proposital: quem vender liga.
