-- 130_demonstrativos_gd.sql
--
-- DEMONSTRATIVO DE GD DA NEOENERGIA (Junior 21/09/2026). Todo mês a
-- concessionária manda por e-mail o "Mini e Microgeração — Demonstrativo do
-- Faturamento" (r2d2.frms@neoenergia.com, anexo RelatorioResumo.pdf). Ele traz
-- o que ela MEDE: injetado, consumido, compensado, saldo de créditos, créditos
-- a vencer e o % de cada unidade no rateio. Não traz a GERAÇÃO — essa só o
-- nosso monitoramento sabe. Cruzando os dois sai o autoconsumo, o rateio
-- conferido e o aviso de crédito perto de vencer.
--
-- Uma linha por instalação e mês. Reenvio do mesmo mês atualiza (upsert).
-- Ver docs/superpowers/specs/2026-09-21-demonstrativo-gd-ingestao-design.md.

create table if not exists demonstrativos_gd (
  id                        uuid primary key default gen_random_uuid(),
  -- Multi-tenant desde o nascimento: demonstrativo tem consumo e saldo de
  -- crédito do cliente — dado de dentro da casa dele.
  company_id                uuid not null default '00000000-0000-0000-0000-000000000001',
  lead_id                   uuid references leads(id) on delete set null,

  cliente_nome              text not null,
  codigo_cliente            text not null,
  instalacao                text not null,
  referencia                date not null,          -- 1º dia do mês faturado

  medidor                   text,
  injetado_kwh              numeric(12,2),
  saldo_mes_anterior_kwh    numeric(12,2),
  injetado_acumulado_kwh    numeric(12,2),
  consumo_kwh               numeric(12,2),
  credito_utilizado_kwh     numeric(12,2),
  credito_restante_kwh      numeric(12,2),
  credito_expira            date,

  total_injetado_kwh        numeric(12,2),
  total_compensado_kwh      numeric(12,2),
  saldo_acumulado_kwh       numeric(12,2),
  proximo_expirar_kwh       numeric(12,2),
  ciclo_expirar             date,
  creditos_expirados_kwh    numeric(12,2),

  historico                 jsonb not null default '[]'::jsonb,  -- 13 meses
  unidades                  jsonb not null default '[]'::jsonb,  -- rateio: codigo, %, saldo
  inconsistencias           jsonb not null default '[]'::jsonb,
  alertas                   jsonb not null default '[]'::jsonb,
  geracao_mes_kwh           numeric(12,2),          -- do monitoramento, no momento da leitura

  -- DKIM da Neoenergia conferido no e-mail bruto (mailauth + DNS). Mes
  -- verificado nunca e sobrescrito por e-mail sem prova de origem.
  origem_verificada         boolean not null default false,

  email_id                  text,                   -- id do e-mail na Resend
  texto_bruto               text,                   -- texto extraído do PDF (reprocessar sem baixar de novo)
  recebido_em               timestamptz not null default now(),
  atualizado_em             timestamptz not null default now(),

  constraint demonstrativos_gd_unico unique (company_id, instalacao, referencia)
);

comment on constraint demonstrativos_gd_unico on demonstrativos_gd is
  'Um demonstrativo por instalação e mês. A Neoenergia às vezes reenvia o mesmo mês (visto em 11/09/2026): upsert, não duplica.';

create index if not exists demonstrativos_gd_lead_mes
  on demonstrativos_gd (lead_id, referencia desc) where lead_id is not null;

create index if not exists demonstrativos_gd_empresa_mes
  on demonstrativos_gd (company_id, referencia desc);

create index if not exists demonstrativos_gd_email
  on demonstrativos_gd (email_id) where email_id is not null;

-- ISOLAMENTO POR EMPRESA — mesmo padrão da 123.
ALTER TABLE public.demonstrativos_gd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demonstrativos_gd FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.demonstrativos_gd;
CREATE POLICY company_isolation ON public.demonstrativos_gd
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

NOTIFY pgrst, 'reload schema';
