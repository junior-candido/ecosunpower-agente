-- Migration 008: tracking de funil de anuncios + fluxo pos-instalacao

-- -------- LEADS: colunas de rastreamento de origem --------

-- lead_source: sem default propositalmente. Leads historicos ficam NULL
-- (realidade — nao sabemos a origem deles). Leads novos sao preenchidos
-- explicitamente pelo app conforme o canal de entrada.
alter table leads add column if not exists lead_source text;
-- valores: direto | ad_ig_leadform | ad_fb_leadform | ad_ig_dm | ad_fb_dm
--          | ad_ig_cta_wa | ad_fb_cta_wa | organico_ig | organico_fb
--          | reengajamento_manual | indicacao | google_meu_negocio | site

alter table leads add column if not exists utm_source text;
alter table leads add column if not exists utm_campaign text;
alter table leads add column if not exists utm_medium text;
alter table leads add column if not exists utm_content text;

-- Rastreia o anuncio/campanha especifico se veio via Lead Ads
alter table leads add column if not exists ad_campaign_id text;
alter table leads add column if not exists ad_id text;
alter table leads add column if not exists ad_form_id text;

create index if not exists idx_leads_lead_source on leads(lead_source);
create index if not exists idx_leads_campaign on leads(ad_campaign_id) where ad_campaign_id is not null;

-- -------- LEADS: ciclo de vida da instalacao --------

-- valores: null | contrato_assinado | equipamento_entregue | instalado
--          | medidor_trocado | operando | pos_venda_concluido
alter table leads add column if not exists installation_status text;

-- Garante que so valores validos entrem. NULL e permitido (lead ainda nao
-- chegou na fase de instalacao). CHECK constraint protege contra typo em
-- update direto via SQL Editor.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_installation_status_check'
  ) then
    alter table leads add constraint leads_installation_status_check
      check (installation_status is null or installation_status in (
        'contrato_assinado', 'equipamento_entregue', 'instalado',
        'medidor_trocado', 'operando', 'pos_venda_concluido'
      ));
  end if;
end $$;

alter table leads add column if not exists contract_signed_at timestamptz;
alter table leads add column if not exists installed_at timestamptz;
alter table leads add column if not exists meter_swapped_at timestamptz;

create index if not exists idx_leads_installation_status
  on leads(installation_status) where installation_status is not null;

-- -------- POST-INSTALL TOUCHES: fluxo automatico de pos-venda --------
-- Acionado quando Junior marca o lead como 'medidor_trocado'. A partir desse
-- momento, agendamos: pedido de avaliacao Google (dia 0), reforco leve (dia 7),
-- convite pra indicacao (dia 30).

create table if not exists post_install_touches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  touch_type text not null, -- review_request | review_nudge | indication_invite
  scheduled_for timestamptz not null,
  status text not null default 'pending', -- pending | sent | failed | canceled | replied_positive | review_confirmed
  sent_at timestamptz,
  message_sent text,
  reply_received text,
  created_at timestamptz not null default now()
);

create index if not exists idx_post_install_touches_pending
  on post_install_touches(scheduled_for) where status = 'pending';
create index if not exists idx_post_install_touches_lead
  on post_install_touches(lead_id);

-- Garante que nao existam toques pending duplicados pra mesma combinacao
-- (lead, touch_type). Protege contra race condition no scheduleOnMeterSwap
-- caso o endpoint /meter-swapped seja chamado 2x em concorrencia (retry
-- de webhook, duplo clique, etc). INSERT concorrente vira conflict em vez
-- de duplicar.
create unique index if not exists idx_post_install_touches_unique_pending
  on post_install_touches(lead_id, touch_type) where status = 'pending';

alter table post_install_touches enable row level security;

-- -------- META LEADGEN EVENTS: registro bruto dos eventos de Lead Ads --------
-- Ajuda a auditar / reprocessar se um webhook falhar. Cada linha e um evento
-- unico do Meta. O `leadgen_id` e o ID do lead no lado da Meta.

create table if not exists meta_leadgen_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  leadgen_id text not null unique,
  ad_id text,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  form_id text,
  form_name text,
  raw_payload jsonb,
  processed boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_meta_leadgen_campaign on meta_leadgen_events(campaign_id);
create index if not exists idx_meta_leadgen_unprocessed
  on meta_leadgen_events(created_at) where processed = false;

alter table meta_leadgen_events enable row level security;
