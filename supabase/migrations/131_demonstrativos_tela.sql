-- 131_demonstrativos_tela.sql
--
-- TELA DE DEMONSTRATIVOS (Junior 23/09/2026) — fatia 1.
-- Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.
--
-- 1) demonstrativos_gd ganha:
--    origem      — de onde veio: e-mail da concessionária, PDF enviado na tela ou digitado.
--    assinatura  — resumo dos números do mês; e-mail repetido com os MESMOS números
--                  não gera aviso novo no WhatsApp.
--    conferido_* — quem confirmou na tela (PDF manual/digitado) e quando.
-- 2) geracao_mensal_gd — geração do mês informada à mão (digitada; na fatia 3,
--    também por print). A geração da API NÃO é copiada pra cá: é lida da
--    geracao_diaria na hora, pra nunca ficar velha.

alter table demonstrativos_gd
  add column if not exists origem text not null default 'email',
  add column if not exists assinatura text,
  add column if not exists conferido_por uuid,
  add column if not exists conferido_em timestamptz;

do $$ begin
  alter table demonstrativos_gd
    add constraint demonstrativos_gd_origem_valida check (origem in ('email', 'pdf_manual', 'digitado'));
exception when duplicate_object then null; end $$;

create table if not exists geracao_mensal_gd (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default '00000000-0000-0000-0000-000000000001',
  lead_id        uuid references leads(id) on delete set null,
  instalacao     text not null,
  referencia     date not null,                       -- 1º dia do mês
  kwh            numeric(12,2) not null check (kwh >= 0),
  origem         text not null check (origem in ('print', 'digitado')),
  fonte          jsonb not null default '{}'::jsonb,  -- arquivo / modelo de tela / observação
  conferido_por  uuid,
  conferido_em   timestamptz not null default now(),
  constraint geracao_mensal_gd_unico unique (company_id, instalacao, referencia)
);

create index if not exists geracao_mensal_gd_empresa_inst
  on geracao_mensal_gd (company_id, instalacao, referencia desc);

-- ISOLAMENTO POR EMPRESA — mesmo padrão da 123/130.
ALTER TABLE public.geracao_mensal_gd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geracao_mensal_gd FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.geracao_mensal_gd;
CREATE POLICY company_isolation ON public.geracao_mensal_gd
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

NOTIFY pgrst, 'reload schema';
