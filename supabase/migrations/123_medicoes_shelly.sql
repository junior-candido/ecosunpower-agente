-- 123_medicoes_shelly.sql
--
-- KIT DE MEDIÇÃO (Junior 07/09/2026). O medidor fica na casa do CLIENTE e a
-- plataforma fica aqui — não existe rede local em comum. Então o aparelho
-- EMPURRA a leitura pro nosso servidor, de minuto em minuto, e é aqui que ela
-- pousa. (Descoberto na marra: o Shelly da casa do Junior e o computador do
-- escritório estavam ambos em 192.168.1.8, em redes diferentes que nunca se
-- falam. Ler por IP serve pra bancada, não pra produto.)
--
-- O que sustenta os R$ 39/mês não é mostrar o consumo: é a JANELA DE 15
-- MINUTOS. A concessionária mede demanda nessa janela e o medidor dela alisa o
-- pico. Guardando de 1 em 1 minuto, a gente mostra o pico que o cliente paga e
-- não enxerga — e isso vira laudo.

create table if not exists medicoes_shelly (
  id                    uuid primary key default gen_random_uuid(),
  -- Multi-tenant desde o nascimento: medidor de cliente da Conquista Solar não
  -- pode aparecer no painel da EcoSun, nem o contrário.
  company_id            uuid not null default '00000000-0000-0000-0000-000000000001',

  device_id             text not null,          -- id do aparelho (ex.: 007007422d90)
  apelido               text,                   -- "Medidor Quadro", "Casa do Mário"
  lead_id               uuid,                   -- de quem é este medidor, quando sabemos
  canal                 smallint not null default 0,

  medido_em             timestamptz not null,   -- quando o aparelho leu
  recebido_em           timestamptz not null default now(),

  tensao                numeric(7,2),           -- V
  corrente              numeric(9,3),           -- A
  potencia_w            numeric(11,2),          -- W  (ativa; negativa = injetando)
  potencia_va           numeric(11,2),          -- VA (aparente)
  fator_potencia        numeric(5,3),
  energia_wh            numeric(14,2),          -- acumulado importado
  energia_devolvida_wh  numeric(14,2),          -- acumulado injetado na rede

  constraint medicoes_shelly_unica unique (device_id, canal, medido_em)
);

comment on constraint medicoes_shelly_unica on medicoes_shelly is
  'Idempotência: o aparelho reenvia quando fica na dúvida da entrega. Sem isso, uma leitura contaria duas vezes e falsearia a demanda.';

-- Consulta que mais roda: as leituras de um aparelho num período, da mais nova
-- pra mais velha (gráfico e janela de 15 min).
create index if not exists medicoes_shelly_device_tempo
  on medicoes_shelly (device_id, medido_em desc);

create index if not exists medicoes_shelly_empresa_tempo
  on medicoes_shelly (company_id, medido_em desc);

create index if not exists medicoes_shelly_lead
  on medicoes_shelly (lead_id) where lead_id is not null;

-- ISOLAMENTO POR EMPRESA. Medição é dado de dentro da casa do cliente: mostra
-- rotina, horário em que a família sai, quando chega. Vazar isso entre tenants
-- seria pior que vazar um lead. Mesmo padrão das migrations 079+.
ALTER TABLE public.medicoes_shelly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicoes_shelly FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.medicoes_shelly;
CREATE POLICY company_isolation ON public.medicoes_shelly
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
