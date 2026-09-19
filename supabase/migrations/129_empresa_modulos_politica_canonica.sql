-- 129_empresa_modulos_politica_canonica.sql
--
-- Conserto de um erro meu na 128.
--
-- A politica que escrevi la lia `current_setting('request.company_id')`, mas as
-- outras 56 politicas do sistema (migration 111 em diante) usam OUTRA coisa:
--
--   coalesce(
--     nullif(current_setting('app.company_id', true), '')::uuid,
--     (auth.jwt() ->> 'company_id')::uuid)
--
-- Com o nome errado a politica da empresa_modulos nunca casaria — e, pior, a
-- tabela que diz "quem contratou o que" ficaria fora do padrao justo quando o
-- RLS estrito entrar (ver src/modules/tenant-db.ts), porque e o segundo termo
-- desse coalesce que le o cracha por empresa.
--
-- Aproveita e devolve a chave estrangeira, que caiu quando a tabela foi criada
-- na mao no SQL Editor: sem ela, apagar uma empresa deixa modulo orfao.

alter table empresa_modulos enable row level security;

drop policy if exists empresa_modulos_isolamento on empresa_modulos;

create policy company_isolation on empresa_modulos
  as permissive for all
  using (company_id = (select coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  with check (company_id = (select coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- Chave estrangeira que faltou. Idempotente: so cria se ainda nao existir.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'empresa_modulos_company_id_fkey'
       and conrelid = 'public.empresa_modulos'::regclass
  ) then
    alter table empresa_modulos
      add constraint empresa_modulos_company_id_fkey
      foreign key (company_id) references companies(id) on delete cascade;
  end if;
end $$;

comment on table empresa_modulos is
  'Modulos contratados por empresa. Ausencia da linha = modulo DESLIGADO. Consultado por toda automacao antes de tocar dado do tenant.';
comment on column empresa_modulos.modulo is
  'eva | email | pasta_digital | monitoramento | financeiro | fiscal | rh | marketing | medicao';
