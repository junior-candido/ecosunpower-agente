-- 136_medidores_energia.sql
--
-- GESTÃO DE ENERGIA — G1 (spec docs/superpowers/specs/2026-09-28-gestao-de-energia-design.md §3 EN-1).
--
-- Até aqui o recebimento do Shelly (migration 123) tinha UM token global e
-- gravava tudo com a empresa padrão (EcoSun). Com um segundo cliente de outra
-- empresa isso vaza. A partir daqui cada medidor é um cadastro:
--   - pertence a UMA empresa (company_id, sem default — carimbo explícito);
--   - um aparelho só existe UMA vez na plataforma inteira (device_id único
--     no GLOBAL, sem o prefixo "shellypro3em-" e em minúsculas) — o mesmo
--     Shelly não pode mandar dado para duas empresas;
--   - tem o SEU token (só o hash SHA-256 fica aqui; o token claro aparece uma
--     vez na tela de cadastro);
--   - aponta pra usina da mesma UC (sistema_id), quando existe, pra fazer a
--     conta gerado × comprado × devolvido × consumido;
--   - guarda a chave da nuvem Shelly CIFRADA (AES-256-GCM, env ENERGIA_CRED_KEY,
--     amarrada ao id do medidor e da empresa).
--
-- Consumo é dado pessoal (mostra a rotina da família). RLS FORCE igual à 123.
-- Apagar o medidor apaga TUDO dele (bruto, 15 min e dia) em cascata (LGPD).
-- Idempotente: pode rodar de novo sem estragar nada.

create table if not exists medidores_energia (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references companies(id) on delete cascade, -- sem default: carimbo explícito
  lead_id                 uuid references leads(id) on delete set null,
  sistema_id              uuid references sistemas_clientes(id) on delete set null, -- usina da mesma UC
  apelido                 text not null,
  fabricante              text not null default 'shelly' check (fabricante in ('shelly')),
  modelo                  text,                                -- 'SPEM-003CEBEU120'
  device_id               text not null,                       -- '007007422d90' (sem o prefixo "shellypro3em-", minúsculo)
  modo_coleta             text not null default 'push' check (modo_coleta in ('push', 'nuvem', 'push_nuvem')),
  perfil                  text not null default 'triphase' check (perfil in ('triphase', 'monophase')),
  canais                  jsonb not null default '{"rede": 2}'::jsonb, -- {rede, geracao?, cargas?:[{canal,nome}]}
  ligacao                 text check (ligacao in ('mono', 'bi', 'tri')),
  tensao_nominal_v        smallint check (tensao_nominal_v in (127, 220, 380)),
  concessionaria          text,
  uc_instalacao           text,                                -- = demonstrativos_gd.instalacao
  codigo_cliente          text,                                -- = demonstrativos_gd.codigo_cliente
  grupo_gd                text check (grupo_gd in ('gd1', 'gd2', 'gd1_gd2', 'sem_gd')),
  api_credentials_cifrado text,                                -- AES-256-GCM {server_uri, auth_key}. NUNCA logar.
  token_ingest_hash       text,                                -- sha256 (hex) do token do script. NUNCA o token claro.
  ativo                   boolean not null default true,       -- false = webhook recusa e os crons pulam
  -- Chegada de dado (vigia de silêncio). Só isto decide "parou"/"voltou".
  status                  text not null default 'aguardando'
                            check (status in ('aguardando', 'ok', 'mudo')),
  status_desde            timestamptz not null default now(),
  ultima_leitura_em       timestamptz,
  ultimo_erro             text,
  -- Chave da nuvem Shelly, SEPARADA do status acima: chave recusada num
  -- medidor "script + nuvem de reserva" não pode travar o vigia do script.
  nuvem_ok                boolean,                             -- null = ainda não testada; false = recusada/não abre
  nuvem_desde             timestamptz,                         -- quando nuvem_ok mudou pra false
  nuvem_avisado_em        timestamptz,                         -- aviso da chave recusada já saiu
  -- Freio de avisos: no máximo 4 por medidor por dia (dia de Brasília).
  aviso_dia               date,
  avisos_no_dia           smallint not null default 0,
  consentimento_em        timestamptz,                         -- LGPD: aceite do titular
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table medidores_energia is
  'Medidores de consumo (Shelly) por empresa. Consumo é dado pessoal: RLS FORCE por company_id. Um aparelho só existe uma vez na plataforma.';
comment on column medidores_energia.api_credentials_cifrado is
  'Chave da nuvem Shelly cifrada (AES-256-GCM, env ENERGIA_CRED_KEY, AAD = medidor + empresa). Nunca volta pra tela nem pro log.';
comment on column medidores_energia.token_ingest_hash is
  'SHA-256 (hex) do token que o script do aparelho manda no x-shelly-token. O token claro nunca é guardado.';

-- Quem rodou uma versão anterior deste arquivo (antes de 28/09) ganha as
-- colunas novas; quem roda a primeira vez não é afetado.
alter table medidores_energia add column if not exists nuvem_ok boolean;
alter table medidores_energia add column if not exists nuvem_desde timestamptz;
alter table medidores_energia add column if not exists nuvem_avisado_em timestamptz;
alter table medidores_energia add column if not exists aviso_dia date;
alter table medidores_energia add column if not exists avisos_no_dia smallint not null default 0;
-- Versões anteriores tinham o device único POR EMPRESA.
alter table medidores_energia drop constraint if exists medidores_energia_device_unico;

-- Um aparelho, uma empresa: único no GLOBAL, comparando sem o prefixo do
-- modelo e sem maiúsculas (o banco garante mesmo se alguém gravar "cru").
create unique index if not exists medidores_energia_device_global
  on medidores_energia ((lower(regexp_replace(device_id, '^shelly[a-z0-9]*-', '', 'i'))));

-- Alvo das FKs compostas (medidor_id, company_id) das tabelas de resumo (137):
-- uma linha de resumo nunca aponta pra medidor de outra empresa.
create unique index if not exists medidores_energia_id_empresa
  on medidores_energia (id, company_id);

create unique index if not exists medidores_energia_token
  on medidores_energia (token_ingest_hash) where token_ingest_hash is not null;
create index if not exists medidores_energia_lead
  on medidores_energia (lead_id) where lead_id is not null;
create index if not exists medidores_energia_empresa
  on medidores_energia (company_id);

-- Vínculo do bruto (1 min) com o medidor. Apagar o medidor apaga o bruto dele.
-- Leituras antigas ganham o vínculo no bloco do piloto, lá embaixo.
alter table medicoes_shelly add column if not exists medidor_id uuid references medidores_energia(id) on delete cascade;
-- A agregação lê por (medidor, canal, período).
drop index if exists medicoes_shelly_medidor_tempo;
create index if not exists medicoes_shelly_medidor_canal_tempo on medicoes_shelly (medidor_id, canal, medido_em);

-- ISOLAMENTO POR EMPRESA (mesmo texto da 123 / 129).
ALTER TABLE public.medidores_energia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medidores_energia FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.medidores_energia;
CREATE POLICY company_isolation ON public.medidores_energia
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- ---------------------------------------------------------------------------
-- PILOTO: o medidor do quadro da casa do Junior (Shelly Pro 3EM
-- shellypro3em-007007422d90) já manda dado desde 07/09 pelo token global.
-- Cadastra ele na EcoSun e liga o bruto que já existe.
--
-- Usina: a casa tem um Solis-1P5K-4G de 6,6 kWp já na plataforma. A ligação
-- só é feita se a EcoSun tiver EXATAMENTE UMA usina Solis ativa — com mais de
-- uma, fica sem usina (a tela avisa "ligue a usina a este medidor") e o Junior
-- escolhe na tela de edição do medidor.
-- TODO(Junior): conferir depois de aplicar:
--   select id, apelido, potencia_kwp from sistemas_clientes
--    where company_id = '00000000-0000-0000-0000-000000000001' and marca_inversor = 'solis';
-- ---------------------------------------------------------------------------
insert into medidores_energia (
  company_id, lead_id, sistema_id, apelido, fabricante, modelo, device_id, modo_coleta,
  perfil, canais, ligacao, tensao_nominal_v, concessionaria, grupo_gd, status, ultima_leitura_em
)
select
  '00000000-0000-0000-0000-000000000001',
  usina.lead_id,
  usina.id,
  'Medidor Quadro',
  'shelly',
  'SPEM-003CEBEU120',
  '007007422d90',
  'push',
  'triphase',
  '{"rede": 2}'::jsonb,
  'mono',
  220,
  'Neoenergia Brasília',
  'gd1',
  'ok',
  (select max(medido_em) from medicoes_shelly where lower(device_id) like '%007007422d90')
from (select 1) as um
left join lateral (
  select s.id, s.lead_id
    from sistemas_clientes s
   where s.company_id = '00000000-0000-0000-0000-000000000001'
     and s.marca_inversor = 'solis'
     and s.ativo
     and (select count(*) from sistemas_clientes s2
           where s2.company_id = '00000000-0000-0000-0000-000000000001'
             and s2.marca_inversor = 'solis' and s2.ativo) = 1
   limit 1
) as usina on true
on conflict do nothing;

-- Liga as leituras já gravadas ao medidor. O script do aparelho manda o id
-- com ou sem o prefixo do modelo ("shellypro3em-007007422d90"); compara sem
-- ele. As linhas antigas ficam com o id "cru" (continuam legíveis: tudo que lê
-- o bruto da Gestão de Energia usa o medidor_id).
update medicoes_shelly m
   set medidor_id = e.id
  from medidores_energia e
 where m.medidor_id is null
   and m.company_id = e.company_id
   and lower(regexp_replace(m.device_id, '^shelly[a-z0-9]*-', '', 'i')) = e.device_id;
