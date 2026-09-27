-- 132_relatorios_gd.sql
--
-- RELATÓRIO MENSAL DA USINA (Junior 26/09/2026) — fatia 2 dos demonstrativos.
-- Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.
--
-- 1) empresa_config.gd_tarifa_rs_kwh — tarifa da "economia estimada"
--    (compensado × tarifa). Padrão 0,99. Cada empresa ajusta a sua.
-- 2) relatorios_gd_gerados — cada PDF gerado fica registrado com os números
--    que saíram nele (rastreio: "o que mandamos pro cliente em agosto?").

alter table empresa_config
  add column if not exists gd_tarifa_rs_kwh numeric(6,3) not null default 0.99;

do $$ begin
  alter table empresa_config
    add constraint empresa_config_gd_tarifa_valida check (gd_tarifa_rs_kwh > 0 and gd_tarifa_rs_kwh < 10);
exception when duplicate_object then null; end $$;

create table if not exists relatorios_gd_gerados (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  instalacao  text not null,
  referencia  date not null,                       -- 1º dia do mês do relatório
  gerado_por  uuid,
  gerado_em   timestamptz not null default now(),
  numeros     jsonb not null default '{}'::jsonb   -- o que saiu no PDF
);

create index if not exists relatorios_gd_gerados_empresa_inst
  on relatorios_gd_gerados (company_id, instalacao, referencia desc);

-- ISOLAMENTO POR EMPRESA — mesmo padrão da 123/130/131.
ALTER TABLE public.relatorios_gd_gerados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorios_gd_gerados FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.relatorios_gd_gerados;
CREATE POLICY company_isolation ON public.relatorios_gd_gerados
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

NOTIFY pgrst, 'reload schema';
