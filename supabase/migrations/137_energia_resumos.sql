-- 137_energia_resumos.sql
--
-- GESTÃO DE ENERGIA — G1 (spec §2.4 e §3 EN-2). Três camadas:
--
--   medicoes_shelly (1 min, bruto)  →  energia_15min  →  energia_diaria
--      guarda 90 dias                  guarda 25 meses     guarda enquanto houver contrato
--
-- 15 min é a janela da concessionária (demanda) — a unidade natural do produto.
-- A energia de cada janela sai da DIFERENÇA DOS CONTADORES do aparelho,
-- repartida pelo tempo. Intervalo sem dado é BURACO: a janela não é gravada
-- (ou fica com segundos_cobertos < 900) — nunca vira zero inventado.
--
-- Dia = dia local de Brasília (UTC−3), igual geracao_diaria.data.
-- Consumo é dado pessoal: RLS FORCE por company_id nas duas tabelas, e FK
-- composta (medidor_id, company_id) → medidores_energia com ON DELETE CASCADE:
-- "apagar medidor e todos os dados" leva as janelas e os dias junto.
-- Idempotente: pode rodar de novo sem estragar nada.

create table if not exists energia_15min (
  medidor_id          uuid not null,
  company_id          uuid not null,
  papel               text not null default 'rede' check (papel in ('rede', 'geracao', 'carga')),
  canal               smallint not null default 0,
  inicio              timestamptz not null,                   -- :00 :15 :30 :45
  importado_wh        numeric(12,3) not null default 0,       -- só do tempo coberto (ver segundos_cobertos)
  exportado_wh        numeric(12,3) not null default 0,
  potencia_max_w      numeric(11,2),
  tensao_min_v        numeric(6,2),
  tensao_max_v        numeric(6,2),
  tensao_med_v        numeric(6,2),
  fp_medio            numeric(5,3),
  min_tensao_precaria smallint not null default 0,            -- leituras de 1 min na faixa precária (PRODIST, push)
  min_tensao_critica  smallint not null default 0,            -- idem crítica
  min_acima_242       smallint not null default 0,            -- risco de desarme do inversor
  segundos_cobertos   smallint not null default 0 check (segundos_cobertos between 0 and 900),
  fonte               text not null check (fonte in ('push', 'nuvem', 'backfill')),
  atualizado_em       timestamptz not null default now(),
  primary key (medidor_id, papel, canal, inicio),
  -- FK composta: a linha é do medidor E da empresa dele. Apagar o medidor
  -- apaga as janelas (LGPD).
  constraint energia_15min_medidor_fk foreign key (medidor_id, company_id)
    references medidores_energia (id, company_id) on delete cascade
);

comment on table energia_15min is
  'Energia por janela de 15 min (diferença de contadores). Janela sem dado não existe — nunca zero inventado.';

create index if not exists energia_15min_empresa_inicio on energia_15min (company_id, inicio);
-- O fechamento da madrugada procura janela mexida DEPOIS de o dia fechar
-- (backfill colado à mão) pra refazer aquele dia.
create index if not exists energia_15min_medidor_atualizado on energia_15min (medidor_id, atualizado_em);

create table if not exists energia_diaria (
  medidor_id            uuid not null,
  company_id            uuid not null,
  dia                   date not null,                         -- dia local de Brasília
  importado_kwh         numeric(10,3),
  exportado_kwh         numeric(10,3),
  geracao_kwh           numeric(10,3),                         -- cópia de geracao_diaria (null se não há usina/dado)
  consumo_kwh           numeric(10,3),                         -- gerado + importado − exportado (null se faltar geração)
  imp_ponta_kwh         numeric(10,3),
  imp_intermediario_kwh numeric(10,3),
  imp_fora_ponta_kwh    numeric(10,3),
  demanda_max_w         numeric(11,2),
  demanda_max_inicio    timestamptz,
  base_noturna_w        numeric(11,2),                         -- mediana 00h–05h
  tensao_min_v          numeric(6,2),
  tensao_max_v          numeric(6,2),
  min_precaria          integer,
  min_critica           integer,
  cobertura_pct         numeric(5,2) not null,                 -- % do dia com dado
  fechado_em            timestamptz not null default now(),
  primary key (medidor_id, dia),
  constraint energia_diaria_medidor_fk foreign key (medidor_id, company_id)
    references medidores_energia (id, company_id) on delete cascade
);

comment on table energia_diaria is
  'Resumo diário do medidor (dia de Brasília). cobertura_pct diz quanto do dia tem dado; dia sem dado não tem linha.';

create index if not exists energia_diaria_empresa_dia on energia_diaria (company_id, dia);

-- ISOLAMENTO POR EMPRESA (mesmo texto da 123 / 129).
ALTER TABLE public.energia_15min ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energia_15min FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.energia_15min;
CREATE POLICY company_isolation ON public.energia_15min
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

ALTER TABLE public.energia_diaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energia_diaria FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.energia_diaria;
CREATE POLICY company_isolation ON public.energia_diaria
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
