-- =============================================================================
-- INSTALADOR ÚNICO DE BANCO — EcoSof Kit Clone
-- =============================================================================
-- O QUE É:
--   Script único que reconstrói TODA a estrutura do banco do zero em um projeto
--   Supabase novo e vazio. Equivale a rodar as 49 migrations em sequência, mas
--   em um único paste no SQL Editor.
--
-- COMO USAR:
--   1. Crie um projeto Supabase novo (vazio).
--   2. Abra o SQL Editor do projeto.
--   3. Cole TODO o conteúdo deste arquivo.
--   4. Clique em "Run".
--   5. Confira o bloco de verificação no final — as contagens devem bater.
--
-- GERADO EM: 2026-06-11
-- MIGRATION RANGE: 001 a 049
--
-- ⚠️  REGERAR quando nascer migration nova:
--   Acrescente o conteúdo da nova migration antes do bloco de verificação
--   e atualize o range acima.
--
-- =============================================================================
-- EXCEÇÕES [CLONE] — COMANDOS ADAPTADOS PARA BANCO VAZIO
-- =============================================================================
--
--   [CLONE-001] migration 013 — UPDATE leads SET eva_active = false
--     Razão: backfill que desativa leads "antigos". Em banco vazio não há leads,
--     portanto o UPDATE é inócuo, mas está mantido por fidelidade total.
--     Impacto: nenhum (0 linhas afetadas).
--
--   [CLONE-002] migration 023 — UPDATE/DELETE em sistemas_clientes (Deye stationId)
--     Razão: corrige duplicatas do adapter Deye que existiam em prod.
--     Em banco vazio: UPDATE e DELETE afetam 0 linhas. Mantidos por fidelidade.
--     Impacto: nenhum.
--
--   [CLONE-003] migration 024 — UPDATE/DELETE em sistemas_clientes (Deye 2ª rodada)
--     Razão: idem migration 023, 2ª passada. Banco vazio: 0 linhas afetadas.
--     Impacto: nenhum.
--
--   [CLONE-004] migration 041b — UPDATE propostas_publicas SET lead_id = l.id
--     Razão: backfill que vincula propostas antigas a leads pelo telefone.
--     Em banco vazio: 0 linhas afetadas.
--     Impacto: nenhum.
--
--   [CLONE-005] migration 045 — DELETE/UPDATE em sistemas_clientes (NEP sid→site_id)
--     Razão: corrige duplicatas NEP que existiam em prod.
--     Em banco vazio: 0 linhas afetadas.
--     Impacto: nenhum.
--
--   [CLONE-006] migration 046 — INSERT INTO financeiro_parametros (razao_social, cnpj)
--     Razão: semente com dados ESPECÍFICOS da EcoSunPower (razão social + CNPJ).
--     AÇÃO OBRIGATÓRIA: alterar os valores para o cliente antes de rodar,
--     ou atualizar depois com:
--       UPDATE financeiro_parametros
--         SET razao_social = 'EMPRESA DO CLIENTE LTDA', cnpj = '00.000.000/0001-00'
--       WHERE id = 1;
--     Linha marcada com -- [CLONE] AJUSTAR PARA O CLIENTE abaixo.
--
--   [CLONE-007] migration 046 — INSERT INTO financeiro_atividades (Instalação/Equipamento/Comissão)
--     Razão: atividades com CNAEs específicos da EcoSunPower. Válidos para qualquer
--     empresa de energia solar no Simples Nacional, mas o cliente pode ter atividades
--     diferentes. Revisar se necessário.
--     Linhas marcadas com -- [CLONE] AJUSTAR PARA O CLIENTE abaixo.
--
--   [CLONE-008] migration 047 — INSERT INTO financeiro_categorias
--     Razão: categorias de despesa genéricas (combustível, material elétrico, etc).
--     São reutilizáveis, mas o cliente pode querer adicionar/remover categorias.
--     Linhas marcadas com -- [CLONE] AJUSTAR PARA O CLIENTE abaixo.
--
--   [CLONE-009] migration 049 — seed de empresa_config + empresa_kits
--     Razão: na migration original o seed são os dados REAIS da EcoSunPower
--     (CNPJ, endereço, RT, PIX) e os 6 kits com preços dela. NADA disso pode
--     ir pro clone. Aqui o seed usa PLACEHOLDERS [CONFIGURAR] e NENHUM kit.
--     AÇÃO OBRIGATÓRIA: editar a linha de empresa_config com os dados do
--     cliente E cadastrar os kits dele em empresa_kits ANTES de ativar o clone.
--     Linhas marcadas com -- [CLONE] OBRIGATÓRIO editar antes de usar.
--
-- =============================================================================
-- BUCKETS DE STORAGE (criar manualmente após rodar este script)
-- =============================================================================
--   Ver setup/buckets-storage.md para a lista completa com classificação
--   público/privado e instruções de criação.
--   Buckets criados pelas migrations (004, 006) já estão incluídos abaixo.
--   Os demais precisam ser criados via Dashboard do Supabase → Storage.
--
-- =============================================================================


-- ============ migration 001: initial_schema ============

-- Enum types
CREATE TYPE lead_profile AS ENUM ('residencial', 'comercial', 'agronegocio', 'indefinido');
CREATE TYPE lead_status AS ENUM ('novo', 'qualificando', 'qualificado', 'agendado', 'transferido', 'inativo');
CREATE TYPE session_status AS ENUM ('active', 'paused', 'completed', 'expired');
CREATE TYPE dossier_status AS ENUM ('draft', 'sent', 'read', 'actioned');
CREATE TYPE log_level AS ENUM ('info', 'warn', 'error', 'debug');

-- Leads
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text,
  city text,
  neighborhood text,
  profile lead_profile DEFAULT 'indefinido',
  origin text,
  status lead_status DEFAULT 'novo',
  energy_data jsonb DEFAULT '{}',
  opportunities jsonb DEFAULT '{}',
  future_demand text,
  consent_given boolean DEFAULT false,
  consent_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  anonymized_at timestamptz
);

-- Conversations
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  session_status session_status DEFAULT 'active',
  qualification_step text DEFAULT 'inicio',
  messages jsonb[] DEFAULT '{}',
  summary text,
  message_count integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '2 hours')
);

-- Dossiers
CREATE TABLE dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  content jsonb DEFAULT '{}',
  formatted_text text,
  status dossier_status DEFAULT 'draft',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Engineers
CREATE TABLE engineers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  region text[] DEFAULT '{}',
  calendar_id text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Logs
CREATE TABLE logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level log_level DEFAULT 'info',
  module text,
  message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(session_status);
CREATE INDEX idx_dossiers_lead_id ON dossiers(lead_id);
CREATE INDEX idx_dossiers_status ON dossiers(status);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_created_at ON logs(created_at);

-- RLS (Row Level Security)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Service role policies (server uses service key, full access)
CREATE POLICY "Service role full access" ON leads FOR ALL USING (true);
CREATE POLICY "Service role full access" ON conversations FOR ALL USING (true);
CREATE POLICY "Service role full access" ON dossiers FOR ALL USING (true);
CREATE POLICY "Service role full access" ON engineers FOR ALL USING (true);
CREATE POLICY "Service role full access" ON logs FOR ALL USING (true);


-- ============ migration 002: learning_tables ============

CREATE TABLE IF NOT EXISTS learning_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  topic text NOT NULL,
  detail text,
  frequency integer DEFAULT 1,
  resolved boolean DEFAULT false,
  resolved_action text,
  source_lead_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL,
  question text NOT NULL,
  successful_response text,
  times_used integer DEFAULT 1,
  effectiveness text DEFAULT 'unknown',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_type ON learning_insights(type);
CREATE INDEX IF NOT EXISTS idx_learning_frequency ON learning_insights(frequency);
CREATE INDEX IF NOT EXISTS idx_patterns_used ON conversation_patterns(times_used);

ALTER TABLE learning_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON learning_insights FOR ALL USING (true);
CREATE POLICY "Service role full access" ON conversation_patterns FOR ALL USING (true);


-- ============ migration 003: followup_and_optout ============

-- Add opt_out and contact_type to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_out boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_type text DEFAULT 'cliente';
-- contact_type: 'cliente', 'parceiro', 'amigo', 'vendedor', 'dono'

-- Follow-ups tracking table
CREATE TABLE IF NOT EXISTS followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  step integer NOT NULL,
  message_sent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followups_lead_id ON followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_followups_created_at ON followups(created_at);

ALTER TABLE followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON followups FOR ALL USING (true);


-- ============ migration 004: marketing ============

create table if not exists marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  caption text not null,
  image_prompt text,
  image_url text,
  platforms text[] default array['instagram', 'facebook'],
  status text not null default 'pending_approval',
  approval_token text unique,
  published_results jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz,
  published_by text
);

create index if not exists idx_marketing_drafts_status on marketing_drafts(status);
create index if not exists idx_marketing_drafts_created on marketing_drafts(created_at desc);

alter table marketing_drafts enable row level security;

-- Storage bucket for generated images (public read)
insert into storage.buckets (id, name, public)
values ('marketing-images', 'marketing-images', true)
on conflict (id) do nothing;


-- ============ migration 005: app_flags ============

create table if not exists app_flags (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_flags enable row level security;


-- ============ migration 006: marketing_video ============

alter table marketing_drafts
  add column if not exists video_url text,
  add column if not exists content_type text default 'image';

-- Storage bucket for generated videos (public read)
insert into storage.buckets (id, name, public)
values ('marketing-videos', 'marketing-videos', true)
on conflict (id) do nothing;


-- ============ migration 007: reengagement_cadence ============

create table if not exists reengagement_touches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  touch_number int not null,
  topic_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  sent_at timestamptz,
  message_sent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reengagement_touches_lead on reengagement_touches(lead_id);
create index if not exists idx_reengagement_touches_pending on reengagement_touches(scheduled_for) where status = 'pending';

alter table reengagement_touches enable row level security;


-- ============ migration 008: ads_funnel_and_post_install ============

alter table leads add column if not exists lead_source text;
alter table leads add column if not exists utm_source text;
alter table leads add column if not exists utm_campaign text;
alter table leads add column if not exists utm_medium text;
alter table leads add column if not exists utm_content text;

alter table leads add column if not exists ad_campaign_id text;
alter table leads add column if not exists ad_id text;
alter table leads add column if not exists ad_form_id text;

create index if not exists idx_leads_lead_source on leads(lead_source);
create index if not exists idx_leads_campaign on leads(ad_campaign_id) where ad_campaign_id is not null;

alter table leads add column if not exists installation_status text;

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

create table if not exists post_install_touches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  touch_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  sent_at timestamptz,
  message_sent text,
  reply_received text,
  created_at timestamptz not null default now()
);

create index if not exists idx_post_install_touches_pending
  on post_install_touches(scheduled_for) where status = 'pending';
create index if not exists idx_post_install_touches_lead
  on post_install_touches(lead_id);

create unique index if not exists idx_post_install_touches_unique_pending
  on post_install_touches(lead_id, touch_type) where status = 'pending';

alter table post_install_touches enable row level security;

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


-- ============ migration 009: testimonials_and_review_detection ============

alter table leads add column if not exists review_confirmed_at timestamptz;

create index if not exists idx_leads_review_confirmed
  on leads(review_confirmed_at) where review_confirmed_at is not null;

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  format text not null check (format in ('audio', 'video', 'text', 'screenshot')),
  content text,
  media_url text,
  google_posted boolean default false,
  usable_for_marketing boolean default true,
  sentiment text check (sentiment is null or sentiment in ('positivo', 'neutro', 'negativo')),
  source_message_id text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_testimonials_lead on testimonials(lead_id);
create index if not exists idx_testimonials_usable
  on testimonials(created_at desc)
  where usable_for_marketing = true;

create unique index if not exists idx_testimonials_unique_source
  on testimonials(source_message_id)
  where source_message_id is not null;

alter table testimonials enable row level security;


-- ============ migration 010: meta_leadgen_welcome_tracking ============

alter table leads add column if not exists welcome_sent_at timestamptz;

create index if not exists idx_leads_welcome_pending
  on leads(created_at)
  where welcome_sent_at is null and lead_source in ('ad_ig_leadform', 'ad_fb_leadform');


-- ============ migration 011: marketing_tracking_tag ============

alter table marketing_drafts add column if not exists tracking_tag text;

create unique index if not exists idx_marketing_drafts_tracking_unique
  on marketing_drafts(tracking_tag) where tracking_tag is not null;


-- ============ migration 012: followups_active_flag ============

alter table followups add column if not exists active boolean not null default true;

create index if not exists idx_followups_active_lead
  on followups(lead_id, step desc) where active = true;


-- ============ migration 013: eva_active_and_maintenance ============

alter table leads add column if not exists eva_active boolean not null default true;

-- [CLONE-001] UPDATE abaixo afeta 0 linhas em banco vazio (comportamento correto).
-- Em prod desativava leads antigos para que Junior liberasse 1 a 1 com /eva on.
update leads
   set eva_active = false
 where created_at < now()
   and not (
     status in ('qualificando', 'agendado')
     or exists (
       select 1
         from conversations c
        where c.lead_id = leads.id
          and c.session_status = 'active'
          and c.created_at > now() - interval '72 hours'
     )
   );

create index if not exists idx_leads_eva_active on leads(eva_active) where eva_active = true;

alter table leads add column if not exists maintenance_client boolean not null default false;
alter table leads add column if not exists eva_activated_at timestamptz;

create index if not exists idx_leads_maintenance on leads(maintenance_client) where maintenance_client = true;

create table if not exists eva_intro_pending (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  sent_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_eva_intro_pending_due
  on eva_intro_pending(scheduled_for) where status = 'pending';

create index if not exists idx_eva_intro_pending_lead
  on eva_intro_pending(lead_id, status);

create table if not exists maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  scheduled_date date not null,
  topic text not null,
  status text not null default 'pending',
  sent_at timestamptz,
  message_sent text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (lead_id, scheduled_date, topic)
);

create index if not exists idx_maintenance_reminders_due
  on maintenance_reminders(scheduled_date) where status = 'pending';

create index if not exists idx_maintenance_reminders_lead
  on maintenance_reminders(lead_id, scheduled_date desc);

comment on column leads.eva_active is
  'Se false, Eva nao responde mensagens deste lead automaticamente. Junior libera com /eva on.';
comment on column leads.maintenance_client is
  'Cliente de manutencao recorrente. Recebe lembrete de limpeza em maio e agosto todo ano.';
comment on column leads.eva_activated_at is
  'Timestamp da ultima vez que Junior digitou /eva on neste lead. Usado pelo job de delay 2h.';

comment on table eva_intro_pending is
  'Fila de mensagens de apresentacao agendadas pela Eva apos /eva on. Job processa a cada minuto.';
comment on table maintenance_reminders is
  'Lembretes anuais de limpeza/manutencao. Cron diario verifica scheduled_date e dispara mensagem natural via Anthropic.';


-- ============ migration 014: eva_cadence ============

create table if not exists eva_cadence (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  step int not null check (step >= 1 and step <= 5),
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  sent_at timestamptz,
  message_sent text,
  cancelled_reason text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (lead_id, step)
);

create index if not exists idx_eva_cadence_due
  on eva_cadence (scheduled_for) where status = 'pending';

create index if not exists idx_eva_cadence_lead
  on eva_cadence (lead_id, status);

comment on table eva_cadence is
  'Cadencia de reengajamento. 5 toques por lead em 0h, 15d, 30d, 45d, 60d a partir da ativacao. Cancelada se cliente responder.';
comment on column eva_cadence.step is
  '1=apresentacao, 2=check-in 15d, 3=dica sazonal 30d, 4=expansao 45d, 5=ultimo toque 60d';
comment on column eva_cadence.status is
  'pending=aguardando envio | sending=lock de envio (CAS) | sent=enviada | cancelled=cliente respondeu ou eva desativada | failed=erro no envio';


-- ============ migration 015: blog_drafts ============

CREATE TABLE IF NOT EXISTS blog_drafts (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('tecnico','tecnologia','mercado','regulacao','casos','tutorial')),
  tags text[] NOT NULL DEFAULT '{}',
  content_md text NOT NULL,
  reading_time int NOT NULL DEFAULT 8,
  source_attribution text,

  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','published','discarded','failed')),

  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  published_at timestamptz,
  discarded_at timestamptz,
  discarded_reason text,
  failed_reason text,

  github_commit_sha text,
  github_commit_url text,
  whatsapp_notified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_blog_drafts_status ON blog_drafts(status, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_drafts_category ON blog_drafts(category, generated_at DESC);

COMMENT ON TABLE blog_drafts IS 'Drafts de posts pro blog ecosunpower.eng.br, fluxo: pending -> approved (via zap) -> published (via GitHub API)';
COMMENT ON COLUMN blog_drafts.status IS 'pending=aguardando Junior aprovar via zap; approved=aprovado mas ainda nao publicado; published=ja commitado no repo do site; discarded=Junior rejeitou; failed=erro tecnico';


-- ============ migration 016: propostas_publicas ============

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS propostas_publicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  numero_proposta text NOT NULL,
  cliente_nome text NOT NULL,
  cliente_telefone text,
  html_content text NOT NULL,
  dados_input jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),

  acessos int NOT NULL DEFAULT 0,
  ultimo_acesso_at timestamptz,

  revoked boolean NOT NULL DEFAULT false,
  revoked_reason text
);

CREATE INDEX IF NOT EXISTS idx_propostas_publicas_slug
  ON propostas_publicas(slug)
  WHERE NOT revoked;

CREATE INDEX IF NOT EXISTS idx_propostas_publicas_cliente
  ON propostas_publicas(cliente_nome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_propostas_publicas_expires
  ON propostas_publicas(expires_at)
  WHERE NOT revoked;

COMMENT ON TABLE propostas_publicas IS 'HTML publico das propostas geradas pela Eva (/proposta). Acessado via /p/:slug com TTL de 60 dias.';
COMMENT ON COLUMN propostas_publicas.slug IS 'Token urlsafe aleatorio de 10 chars (nao enumeravel). Ex: x7Kq2pL9aB';
COMMENT ON COLUMN propostas_publicas.expires_at IS 'Apos essa data, /p/:slug retorna 410 Gone.';
COMMENT ON COLUMN propostas_publicas.revoked IS 'Marcacao manual pra revogar acesso antes do expires_at.';


-- ============ migration 017: external_articles ============

CREATE TABLE IF NOT EXISTS public.external_articles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text        NOT NULL,
  external_url  text        UNIQUE NOT NULL,
  title         text        NOT NULL,
  summary       text,
  content       text,
  published_at  timestamptz,
  scraped_at    timestamptz NOT NULL DEFAULT now(),
  keywords      text[]      DEFAULT '{}',
  is_relevant   boolean     DEFAULT true,
  used_in_blog  text[]      DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_external_articles_source_pub
  ON public.external_articles (source, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_external_articles_scraped
  ON public.external_articles (scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_articles_relevant
  ON public.external_articles (is_relevant)
  WHERE is_relevant = true;

COMMENT ON TABLE public.external_articles IS 'Notícias externas raspadas (ANEEL, Portal Solar, etc) pra blog generator';
COMMENT ON COLUMN public.external_articles.source IS 'Identificador da fonte (slug curto, ex: aneel)';
COMMENT ON COLUMN public.external_articles.is_relevant IS 'False quando filtrado por keywords off-topic — mantemos pra audit';
COMMENT ON COLUMN public.external_articles.used_in_blog IS 'IDs de blog_drafts que ja usaram este artigo (evita repetir)';


-- ============ migration 018: proposta_attachments ============

CREATE TABLE IF NOT EXISTS proposta_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_slug TEXT NOT NULL REFERENCES propostas_publicas(slug) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('foto', 'video')),
  ordem SMALLINT NOT NULL CHECK (ordem >= 1 AND ordem <= 3),
  legenda TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_slug_tipo_ordem UNIQUE (proposta_slug, tipo, ordem)
);

CREATE INDEX IF NOT EXISTS idx_attachments_slug ON proposta_attachments(proposta_slug);

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'basica' CHECK (tipo IN ('basica', 'personalizada'));


-- ============ migration 019: proposta_followup ============

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cliente_respondeu_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_skipped_reason text;

COMMENT ON COLUMN propostas_publicas.followup_sent_at IS
  'Timestamp da mensagem automatica que a Eva enviou pro cliente apos detectar primeiro acesso ao link.';

COMMENT ON COLUMN propostas_publicas.cliente_respondeu_at IS
  'Timestamp da primeira resposta do cliente apos receber a mensagem de followup.';

COMMENT ON COLUMN propostas_publicas.followup_skipped_reason IS
  'Razao pela qual followup nao foi enviado (ex: telefone vazio, fora janela 24h, WABA indisponivel).';

CREATE INDEX IF NOT EXISTS idx_propostas_publicas_followup_status
  ON propostas_publicas(followup_sent_at, cliente_respondeu_at)
  WHERE NOT revoked;


-- ============ migration 020: proposta_modo_envio ============

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS modo_envio text;

COMMENT ON COLUMN propostas_publicas.modo_envio IS
  'Modo escolhido pra enviar proposta: junior_envia (manual) ou eva_envia (automatico). Define comportamento do followup automatico.';


-- ============ migration 021: monitoring_systems ============

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sistemas_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  apelido TEXT NOT NULL,

  marca_inversor TEXT NOT NULL CHECK (marca_inversor IN (
    'solaredge', 'sungrow', 'deye', 'hoymiles', 'goodwe', 'huawei', 'foxess', 'nep'
  )),

  api_credentials JSONB NOT NULL DEFAULT '{}'::jsonb,

  potencia_kwp NUMERIC,
  data_instalacao DATE,

  cidade TEXT,
  uf TEXT CHECK (uf IS NULL OR length(uf) = 2),

  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_sincronizacao TIMESTAMPTZ,
  ultimo_erro TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sistemas_clientes_lead
  ON sistemas_clientes(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sistemas_clientes_ativos_marca
  ON sistemas_clientes(marca_inversor) WHERE ativo;

COMMENT ON TABLE sistemas_clientes IS
  'Sistemas FV de clientes monitorados via API. 1 linha = 1 sistema instalado. Chave de busca pelo cron diario.';
COMMENT ON COLUMN sistemas_clientes.api_credentials IS
  'JSONB com credenciais especificas por marca. NUNCA logar essa coluna em texto.';

CREATE TABLE IF NOT EXISTS geracao_diaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id UUID NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,

  data DATE NOT NULL,
  geracao_kwh NUMERIC NOT NULL CHECK (geracao_kwh >= 0),

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetched_source TEXT NOT NULL DEFAULT 'cron',

  UNIQUE (sistema_id, data)
);

CREATE INDEX IF NOT EXISTS idx_geracao_diaria_sistema_data
  ON geracao_diaria(sistema_id, data DESC);

COMMENT ON TABLE geracao_diaria IS
  'Geracao FV em kWh por sistema por dia. Puxado pelo cron de monitoramento. UPSERT por (sistema_id, data).';

CREATE TABLE IF NOT EXISTS alertas_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id UUID NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'queda_geracao', 'sistema_offline', 'manutencao_devida',
    'milestone_economia', 'oportunidade_upsell', 'falha_inversor'
  )),
  severidade TEXT NOT NULL DEFAULT 'info' CHECK (severidade IN ('info', 'aviso', 'urgente')),
  descricao TEXT NOT NULL,
  payload JSONB,

  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_to_junior_at TIMESTAMPTZ,
  notified_to_cliente_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_pendentes
  ON alertas_sistema(detected_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE alertas_sistema IS
  'Alertas detectados sobre sistemas monitorados. Agente IA proativo (Modulo 6) processa e notifica Junior/cliente.';


-- ============ migration 022: sistemas_dados_detalhados ============

ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS painel_marca text,
  ADD COLUMN IF NOT EXISTS painel_modelo text,
  ADD COLUMN IF NOT EXISTS qtd_paineis int CHECK (qtd_paineis IS NULL OR qtd_paineis > 0),
  ADD COLUMN IF NOT EXISTS inversor_modelo text,
  ADD COLUMN IF NOT EXISTS telhado_tipo text CHECK (telhado_tipo IS NULL OR telhado_tipo IN (
    'ceramica', 'fibrocimento', 'laje', 'metalico', 'solo', 'outro'
  )),
  ADD COLUMN IF NOT EXISTS telhado_orientacao text CHECK (telhado_orientacao IS NULL OR telhado_orientacao IN (
    'N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'
  )),
  ADD COLUMN IF NOT EXISTS telhado_inclinacao_graus int CHECK (telhado_inclinacao_graus IS NULL OR (telhado_inclinacao_graus >= 0 AND telhado_inclinacao_graus <= 90)),
  ADD COLUMN IF NOT EXISTS sombreamento_pct int CHECK (sombreamento_pct IS NULL OR (sombreamento_pct >= 0 AND sombreamento_pct <= 100)),
  ADD COLUMN IF NOT EXISTS observacoes text;

CREATE INDEX IF NOT EXISTS idx_sistemas_combinacao
  ON sistemas_clientes(painel_marca, inversor_modelo, cidade)
  WHERE ativo AND painel_marca IS NOT NULL;

COMMENT ON COLUMN sistemas_clientes.painel_marca IS
  'Marca do painel solar (Trina, JA, LONGi, Jinko, Risen, Canadian, DAH, etc).';
COMMENT ON COLUMN sistemas_clientes.painel_modelo IS
  'Modelo especifico do painel (ex: TSM-NEG21C.20-700, JAM72D40-580MB).';
COMMENT ON COLUMN sistemas_clientes.qtd_paineis IS
  'Quantidade de paineis no sistema. Util pra validar potencia (qtd × Wp_paine = kWp_sistema).';
COMMENT ON COLUMN sistemas_clientes.telhado_orientacao IS
  'Orientacao predominante: N, NE, L, SE, S, SO, O, NO. NULL se nao mediu.';
COMMENT ON COLUMN sistemas_clientes.telhado_inclinacao_graus IS
  'Inclinacao do telhado em graus (0-90). NULL se nao mediu.';
COMMENT ON COLUMN sistemas_clientes.sombreamento_pct IS
  'Estimativa de sombreamento: 0=sem sombra, 100=totalmente sombreado.';
COMMENT ON COLUMN sistemas_clientes.observacoes IS
  'Notas livres (manutencoes, situacoes especiais, etc).';


-- ============ migration 023: fix_deye_dedupe_site_id ============

-- [CLONE-002] UPDATE e DELETE abaixo afetam 0 linhas em banco vazio.
-- Em prod: migrava stationId->site_id e limpava duplicatas Deye.

UPDATE sistemas_clientes
SET api_credentials = (api_credentials - 'stationId') || jsonb_build_object('site_id', api_credentials->>'stationId')
WHERE marca_inversor = 'deye'
  AND api_credentials ? 'stationId'
  AND NOT (api_credentials ? 'site_id');

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY marca_inversor, api_credentials->>'site_id'
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM sistemas_clientes
  WHERE api_credentials ? 'site_id'
)
DELETE FROM sistemas_clientes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sistemas_clientes_marca_site_id
  ON sistemas_clientes (marca_inversor, (api_credentials->>'site_id'))
  WHERE api_credentials ? 'site_id';

COMMENT ON INDEX uq_sistemas_clientes_marca_site_id IS
  'Garante 1 sistema por (marca + site_id externo). Adapter DEVE salvar site_id no JSONB.';


-- ============ migration 024: unique_index_robusto ============

-- [CLONE-003] UPDATE e DELETE abaixo afetam 0 linhas em banco vazio.
-- Em prod: 2ª passada de limpeza Deye + recria índice com COALESCE.

UPDATE sistemas_clientes
SET api_credentials = (api_credentials - 'stationId') || jsonb_build_object('site_id', api_credentials->>'stationId')
WHERE api_credentials ? 'stationId'
  AND NOT (api_credentials ? 'site_id');

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY marca_inversor, COALESCE(api_credentials->>'site_id', api_credentials->>'stationId')
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM sistemas_clientes
  WHERE COALESCE(api_credentials->>'site_id', api_credentials->>'stationId') IS NOT NULL
)
DELETE FROM sistemas_clientes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DROP INDEX IF EXISTS uq_sistemas_clientes_marca_site_id;

CREATE UNIQUE INDEX uq_sistemas_clientes_marca_site_id
  ON sistemas_clientes (
    marca_inversor,
    COALESCE(api_credentials->>'site_id', api_credentials->>'stationId')
  )
  WHERE COALESCE(api_credentials->>'site_id', api_credentials->>'stationId') IS NOT NULL;

COMMENT ON INDEX uq_sistemas_clientes_marca_site_id IS
  'Garante 1 sistema por (marca + site_id). COALESCE cobre site_id (novo) e stationId (legado camelCase).';


-- ============ migration 025: marketing_schema ============

CREATE TABLE marketing_personas (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  categoria_portfolio TEXT NOT NULL CHECK (categoria_portfolio IN ('on_grid_residencial','on_grid_comercial','hibrido','off_grid','ev_charger','manutencao')),
  descricao TEXT NOT NULL,
  conta_minima_brl INTEGER NOT NULL DEFAULT 700,
  consumo_minimo_kwh INTEGER NOT NULL DEFAULT 700,
  regiao_alvo TEXT NOT NULL,
  palavras_proibidas TEXT[] DEFAULT ARRAY['alugar terra','arrendar','fazenda solar','engenheiro'],
  contexto_marca JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_personas_codigo ON marketing_personas(codigo);

CREATE TABLE marketing_creatives (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL REFERENCES marketing_personas(id),
  briefing TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','aprovado','em_uso','pausado','descartado')),
  imagens JSONB NOT NULL,
  copies JSONB NOT NULL,
  cta_primario TEXT NOT NULL,
  justificativa TEXT,
  created_by_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by_phone TEXT,
  meta_creative_id TEXT
);
CREATE INDEX idx_creatives_status ON marketing_creatives(status);
CREATE INDEX idx_creatives_persona ON marketing_creatives(persona_id);

CREATE TABLE marketing_creative_logs (
  id BIGSERIAL PRIMARY KEY,
  creative_id BIGINT REFERENCES marketing_creatives(id) ON DELETE CASCADE,
  prompt_used TEXT NOT NULL,
  raw_output JSONB NOT NULL,
  filter_results JSONB,
  decision TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE marketing_campaigns (
  id BIGSERIAL PRIMARY KEY,
  meta_campaign_id TEXT NOT NULL UNIQUE,
  codigo_portfolio TEXT NOT NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  daily_budget_cents INTEGER,
  lifetime_budget_cents INTEGER,
  status TEXT NOT NULL,
  cpl_alerta_brl INTEGER NOT NULL DEFAULT 50,
  cpl_critico_brl INTEGER NOT NULL DEFAULT 80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);
CREATE INDEX idx_campaigns_meta_id ON marketing_campaigns(meta_campaign_id);
CREATE INDEX idx_campaigns_status ON marketing_campaigns(status);

CREATE TABLE marketing_campaign_logs (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  meta_creative_id TEXT,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  metrics_snapshot JSONB NOT NULL,
  decided_by TEXT NOT NULL,
  approved_by_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE meta_ads_insights (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  meta_ad_id TEXT,
  spend_cents INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  reach INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  ctr_pct NUMERIC(5,2),
  cpc_cents INTEGER,
  cpm_cents INTEGER,
  leads INTEGER DEFAULT 0,
  cpl_cents INTEGER,
  raw_payload JSONB NOT NULL,
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_insights_campaign_date ON meta_ads_insights(campaign_id, date_start);
CREATE INDEX idx_insights_collected ON meta_ads_insights(collected_at DESC);

CREATE TABLE dm_threads (
  id BIGSERIAL PRIMARY KEY,
  ig_user_id TEXT NOT NULL,
  ig_thread_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','qualified_handed_off','disqualified','escalated_human','abandoned')),
  source_campaign_id BIGINT REFERENCES marketing_campaigns(id),
  source_creative_id BIGINT REFERENCES marketing_creatives(id),
  qualified_data JSONB,
  handoff_zap_phone TEXT,
  context_for_eva JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX idx_dm_threads_status ON dm_threads(status);
CREATE INDEX idx_dm_threads_ig_user ON dm_threads(ig_user_id);

CREATE TABLE dm_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  content TEXT NOT NULL,
  buttons JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dm_messages_thread ON dm_messages(thread_id, created_at);

CREATE TABLE marketing_alerts (
  id BIGSERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  related_campaign_id BIGINT REFERENCES marketing_campaigns(id),
  related_creative_id BIGINT REFERENCES marketing_creatives(id),
  action_required TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','acknowledged','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_alerts_status ON marketing_alerts(status);
CREATE INDEX idx_alerts_severity ON marketing_alerts(severity, created_at DESC);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_creative_id BIGINT REFERENCES marketing_creatives(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS acquisition_campaign_id BIGINT REFERENCES marketing_campaigns(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS dm_thread_id BIGINT REFERENCES dm_threads(id);

CREATE OR REPLACE VIEW v_marketing_dashboard_today AS
SELECT
  COALESCE(SUM(spend_cents), 0) / 100.0 AS spend_today_brl,
  COALESCE(SUM(leads), 0) AS leads_today,
  COALESCE(SUM(clicks), 0) AS clicks_today,
  COALESCE(SUM(impressions), 0) AS impressions_today,
  CASE WHEN SUM(leads) > 0 THEN (SUM(spend_cents)::NUMERIC / SUM(leads) / 100) ELSE NULL END AS cpl_today_brl
FROM meta_ads_insights
WHERE date_start = CURRENT_DATE;


-- ============ migration 026: add_email_to_leads ============

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_email_lower ON leads (LOWER(email)) WHERE email IS NOT NULL;

ALTER TABLE leads
  ADD CONSTRAINT chk_leads_email_format
  CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

CREATE OR REPLACE FUNCTION normalize_email_lower()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email = LOWER(TRIM(NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_email ON leads;
CREATE TRIGGER trg_normalize_email
  BEFORE INSERT OR UPDATE OF email ON leads
  FOR EACH ROW
  EXECUTE FUNCTION normalize_email_lower();

COMMENT ON COLUMN leads.email IS 'Email do cliente (opcional). Normalizado pra lowercase via trigger. Sera usado pra email marketing/comunicacao pos-venda quando feature for ativada.';


-- ============ migration 027: eva_cadence_step_infinite ============

alter table eva_cadence drop constraint if exists eva_cadence_step_check;

alter table eva_cadence
  add constraint eva_cadence_step_check check (step >= 1);

comment on column eva_cadence.step is
  '1-10 = toques canonicos da cadencia (0h, 1d, 3d, 7d, 14d, 30d, 60d, 90d, 180d, 365d). 11+ = continuacoes anuais (cadencia infinita ate cliente responder ou opt-out).';


-- ============ migration 028: campaign_template_mapping ============

ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS template_inicial TEXT;

COMMENT ON COLUMN marketing_campaigns.template_inicial IS
  'Nome do template WABA usado no auto-ack quando lead vem dessa campanha. NULL = usa template default global. Ex: eva_qualificacao_v1, eva_curiosidade_v1';


-- ============ migration 029: proposta_visualizacoes ============

CREATE TABLE IF NOT EXISTS proposta_visualizacoes (
  id BIGSERIAL PRIMARY KEY,
  proposta_slug TEXT NOT NULL REFERENCES propostas_publicas(slug) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  referer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_propvis_slug_time
  ON proposta_visualizacoes(proposta_slug, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_propvis_real_time
  ON proposta_visualizacoes(viewed_at DESC)
  WHERE is_preview = FALSE;

COMMENT ON TABLE proposta_visualizacoes IS
  'Registro individual de cada abertura de proposta publica /p/:slug. 1 linha por acesso.';

COMMENT ON COLUMN proposta_visualizacoes.is_preview IS
  'TRUE quando Junior abriu via ?eu=<PROPOSAL_PREVIEW_TOKEN>. Excluir dos KPIs cliente-facing.';


-- ============ migration 030: eva_knowledge_chunks ============

create extension if not exists vector;

create table if not exists eva_knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default 'ecosunpower',
  source_file text not null,
  chunk_index int  not null,
  content     text not null,
  token_count int,
  file_hash   text not null,
  embedding   vector(1536) not null,
  created_at  timestamptz default now(),
  unique (tenant_id, source_file, chunk_index)
);
create index if not exists eva_kc_embedding_idx
  on eva_knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists eva_kc_file_idx
  on eva_knowledge_chunks (tenant_id, source_file);

create or replace function match_eva_chunks(
  query_embedding vector(1536), p_tenant text, match_count int, min_similarity float
) returns table (source_file text, content text, similarity float)
language sql stable as $$
  select source_file, content, 1 - (embedding <=> query_embedding) as similarity
  from eva_knowledge_chunks
  where tenant_id = p_tenant
    and 1 - (embedding <=> query_embedding) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;


-- ============ migration 031: relatorio_slugs ============

create table if not exists relatorio_slugs (
  slug text primary key,
  sistema_id uuid not null references sistemas_clientes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);
create index if not exists idx_relatorio_slugs_sistema on relatorio_slugs(sistema_id);


-- ============ migration 032: monitoring_alerts ============

create table monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  sistema_id uuid not null references sistemas_clientes(id) on delete cascade,
  tipo text not null,
  severidade text not null,
  texto text not null,
  primeiro_visto_em timestamptz not null default now(),
  last_sent_at timestamptz,
  next_send_at timestamptz,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolved_reason text,
  acao_disparada text,
  acao_disparada_em timestamptz,
  created_at timestamptz not null default now()
);

create unique index monitoring_alerts_dedupe
  on monitoring_alerts (sistema_id, tipo)
  where resolved_at is null;

create index monitoring_alerts_pendente
  on monitoring_alerts (next_send_at)
  where resolved_at is null and snoozed_until is null;

create index monitoring_alerts_sistema
  on monitoring_alerts (sistema_id, resolved_at);


-- ============ migration 033: clientes_perfil ============

alter table leads add column if not exists cpf_cnpj text;
alter table leads add column if not exists data_nascimento date;
alter table leads add column if not exists estado_civil text;
alter type lead_profile add value if not exists 'rural';
update leads set profile = 'rural'::lead_profile where profile = 'agronegocio'::lead_profile;
alter table leads add column if not exists cep text;
alter table leads add column if not exists endereco_rua text;
alter table leads add column if not exists endereco_numero text;
alter table leads add column if not exists endereco_complemento text;
alter table leads add column if not exists uf text;
alter table leads add column if not exists concessionaria text;
alter table leads add column if not exists uc_numero text;
alter table leads add column if not exists tarifa_classe text;
alter table leads add column if not exists tarifa_modalidade text;
alter table leads add column if not exists consumo_medio_kwh integer;
alter table leads add column if not exists conta_media_brl numeric(10,2);
alter table leads add column if not exists consumo_mensal_json jsonb;
alter table leads add column if not exists forma_pagamento text;
alter table leads add column if not exists banco_financiamento text;
alter table leads add column if not exists eh_consumidor_rateio boolean not null default false;
alter table leads add column if not exists uc_geradora_lead_id uuid references leads(id) on delete set null;
alter table leads add column if not exists percentual_rateio numeric(5,2);
alter table leads add column if not exists credito_esperado_kwh integer;
alter table leads add column if not exists vendedor_responsavel text;
alter table leads add column if not exists observacoes_perfil text;

create table lead_anexos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  tipo text not null,
  descricao text,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  created_by text
);
create index lead_anexos_by_lead on lead_anexos (lead_id, created_at desc);
create index lead_anexos_by_tipo on lead_anexos (lead_id, tipo);


-- ============ migration 034: relatorios_pos_instalacao ============

alter table leads add column if not exists post_install_report_sent_at timestamptz;

create table relatorios_pos_instalacao (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  slug text not null unique,
  mensagem_personalizada text,
  data_instalacao date,
  fotos jsonb not null default '[]',
  enviado_em timestamptz,
  enviado_para_phone text,
  acessos integer not null default 0,
  ultimo_acesso_em timestamptz,
  created_at timestamptz not null default now(),
  created_by text default 'junior'
);

create index relatorios_pi_by_lead on relatorios_pos_instalacao (lead_id, created_at desc);
create index relatorios_pi_slug on relatorios_pos_instalacao (slug);

create or replace function increment_pi_access(p_slug text)
returns void language sql security definer as $$
  update relatorios_pos_instalacao
  set acessos = acessos + 1, ultimo_acesso_em = now()
  where slug = p_slug;
$$;


-- ============ migration 035: propostas_publicas_sent_at ============

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS sent_to_client_at timestamptz;

COMMENT ON COLUMN propostas_publicas.sent_to_client_at
  IS 'Timestamp do clique em "Enviar pelo WhatsApp" na tela admin A4. NULL = ainda nao enviado.';


-- ============ migration 036: lead_archived_at ============

alter table leads add column if not exists archived_at timestamptz;

create index if not exists idx_leads_active
  on leads (updated_at desc)
  where archived_at is null;

comment on column leads.archived_at is
  'Marca o momento em que o lead/cliente foi arquivado. NULL = ativo, listas filtram por esse criterio. Reversivel via /clientes/:id/desarquivar.';


-- ============ migration 037: channel_daily_metrics ============

create table if not exists channel_daily_metrics (
  channel      text        not null,
  date         date        not null,
  spend_cents  bigint      not null default 0,
  clicks       integer     not null default 0,
  impressions  integer     not null default 0,
  source       text        not null default 'manual',
  updated_at   timestamptz not null default now(),
  primary key (channel, date)
);


-- ============ migration 038: leads_channel ============

alter table leads add column if not exists channel text;
create index if not exists idx_leads_channel on leads (channel);


-- ============ migration 039: leads_perdido_loss_reason ============

alter type lead_status add value if not exists 'perdido';

alter table leads add column if not exists loss_reason text;

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'leads_loss_reason_chk'
  ) then
    alter table leads add constraint leads_loss_reason_chk check (
      loss_reason is null or loss_reason in (
        'nao_atende', 'concorrente', 'sem_orcamento',
        'fora_area', 'sem_interesse', 'outro'
      )
    );
  end if;
end $$;

alter table leads add column if not exists loss_notes text;

alter table leads add column if not exists lost_at timestamptz;

create index if not exists idx_leads_lost
  on leads (lost_at desc)
  where status = 'perdido';

comment on column leads.loss_reason is
  'Motivo categorizado da perda do lead. NULL = nao perdido (ou perdido sem motivo).';
comment on column leads.loss_notes is
  'Observacao livre do Junior sobre por que perdeu (opcional).';
comment on column leads.lost_at is
  'Timestamp em que foi marcado como perdido. Pra analytics tipo "X perdidos 30d".';


-- ============ migration 040: fechamentos ============

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  proposta_publica_id uuid REFERENCES propostas_publicas(id) ON DELETE SET NULL,

  docs_pedidos text[] NOT NULL,
  dados_snapshot jsonb NOT NULL,

  contrato_drive_id text,
  contrato_drive_link text,
  procuracao_drive_id text,
  procuracao_drive_link text,
  drive_folder_id text,

  status text NOT NULL DEFAULT 'gerado',

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fechamentos_status_check
    CHECK (status IN ('gerado', 'aprovado_junior', 'enviado_cliente', 'cancelado')),
  CONSTRAINT fechamentos_docs_check
    CHECK (cardinality(docs_pedidos) > 0)
);

CREATE INDEX IF NOT EXISTS idx_fechamentos_lead
  ON fechamentos(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fechamentos_status
  ON fechamentos(status, created_at DESC);

COMMENT ON TABLE fechamentos IS
  'Execuções do modo /fechar. dados_snapshot guarda DadosFechamento renderizado nos PDFs.';
COMMENT ON COLUMN fechamentos.created_by IS
  'Telefone do admin (Junior ou ADMIN_EXTRA_PHONES) que disparou o /fechar.';


-- ============ migration 041: propostas_publicas_lead_id ============

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_propostas_publicas_lead
  ON propostas_publicas(lead_id, created_at DESC);

COMMENT ON COLUMN propostas_publicas.lead_id IS
  'FK opcional pro lead criado/vinculado quando a proposta foi gerada. Backfill em 041b roda 1x.';


-- ============ migration 041b: backfill_propostas_publicas_lead_id ============

-- [CLONE-004] UPDATE abaixo afeta 0 linhas em banco vazio.
-- Em prod: vinculava propostas existentes ao lead pelo telefone.
UPDATE propostas_publicas pp
SET lead_id = l.id
FROM leads l
WHERE pp.lead_id IS NULL
  AND l.phone = pp.cliente_telefone
  AND pp.cliente_telefone IS NOT NULL;


-- ============ migration 042: fechamentos_parent_id ============

ALTER TABLE fechamentos
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fechamentos_parent
  ON fechamentos(parent_id);

COMMENT ON COLUMN fechamentos.parent_id IS
  'FK opcional pro fechamento anterior em caso de [Refazer]. Permite rastrear historico de versoes.';


-- ============ migration 043: monitoring_abb ============

ALTER TABLE sistemas_clientes DROP CONSTRAINT IF EXISTS sistemas_clientes_marca_inversor_check;
ALTER TABLE sistemas_clientes ADD CONSTRAINT sistemas_clientes_marca_inversor_check
  CHECK (marca_inversor IN (
    'solaredge', 'sungrow', 'deye', 'hoymiles', 'goodwe', 'huawei', 'foxess', 'nep', 'abb'
  ));


-- ============ migration 044: leads_ctwa_clid_capi ============

alter table leads add column if not exists ctwa_clid text;

alter table leads add column if not exists capi_stages_sent text[] not null default '{}';

create index if not exists idx_leads_ctwa_clid on leads(ctwa_clid) where ctwa_clid is not null;


-- ============ migration 045: fix_nep_sid_to_site_id ============

-- [CLONE-005] DELETE e UPDATE abaixo afetam 0 linhas em banco vazio.
-- Em prod: limpava duplicatas NEP e migrava sid->site_id.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY marca_inversor, api_credentials->>'sid'
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM sistemas_clientes
  WHERE marca_inversor = 'nep'
    AND api_credentials ? 'sid'
)
DELETE FROM sistemas_clientes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE sistemas_clientes
SET api_credentials = (api_credentials - 'sid') || jsonb_build_object('site_id', api_credentials->>'sid')
WHERE marca_inversor = 'nep'
  AND api_credentials ? 'sid'
  AND NOT (api_credentials ? 'site_id');


-- ============ migration 046: financeiro_nucleo ============

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS financeiro_anexos (
  anexo text NOT NULL,
  faixa int NOT NULL,
  rbt12_min numeric(14,2) NOT NULL,
  rbt12_max numeric(14,2) NOT NULL,
  nominal numeric(7,4) NOT NULL,
  deduzir numeric(14,2) NOT NULL,
  PRIMARY KEY (anexo, faixa),
  CONSTRAINT financeiro_anexos_anexo_check CHECK (anexo IN ('I','II','III','IV','V')),
  CONSTRAINT financeiro_anexos_faixa_check CHECK (faixa BETWEEN 1 AND 6)
);

INSERT INTO financeiro_anexos (anexo, faixa, rbt12_min, rbt12_max, nominal, deduzir) VALUES
  ('I',1,0,180000,0.0400,0),('I',2,180000.01,360000,0.0730,5940),('I',3,360000.01,720000,0.0950,13860),
  ('I',4,720000.01,1800000,0.1070,22500),('I',5,1800000.01,3600000,0.1430,87300),('I',6,3600000.01,4800000,0.1900,378000),
  ('II',1,0,180000,0.0450,0),('II',2,180000.01,360000,0.0780,5940),('II',3,360000.01,720000,0.1000,13860),
  ('II',4,720000.01,1800000,0.1120,22500),('II',5,1800000.01,3600000,0.1470,85500),('II',6,3600000.01,4800000,0.3000,720000),
  ('III',1,0,180000,0.0600,0),('III',2,180000.01,360000,0.1120,9360),('III',3,360000.01,720000,0.1350,17640),
  ('III',4,720000.01,1800000,0.1600,35640),('III',5,1800000.01,3600000,0.2100,125640),('III',6,3600000.01,4800000,0.3300,648000),
  ('IV',1,0,180000,0.0450,0),('IV',2,180000.01,360000,0.0900,8100),('IV',3,360000.01,720000,0.1020,12420),
  ('IV',4,720000.01,1800000,0.1400,39780),('IV',5,1800000.01,3600000,0.2200,183780),('IV',6,3600000.01,4800000,0.3300,828000),
  ('V',1,0,180000,0.1550,0),('V',2,180000.01,360000,0.1800,4500),('V',3,360000.01,720000,0.1950,9900),
  ('V',4,720000.01,1800000,0.2050,17100),('V',5,1800000.01,3600000,0.2300,62100),('V',6,3600000.01,4800000,0.3050,540000)
ON CONFLICT (anexo, faixa) DO NOTHING;

CREATE TABLE IF NOT EXISTS financeiro_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnae text,
  anexo_padrao text NOT NULL,
  sujeito_fator_r boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_atividades_anexo_check CHECK (anexo_padrao IN ('I','II','III','IV','V'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_atividades_cnae ON financeiro_atividades(cnae);

-- [CLONE-007] AJUSTAR PARA O CLIENTE — CNAEs específicos da EcoSunPower (energia solar).
-- Válidos para qualquer empresa solar no Simples, mas verificar com contador do cliente.
INSERT INTO financeiro_atividades (nome, cnae, anexo_padrao, sujeito_fator_r) VALUES
  ('Instalação',  '4321-5/00', 'III', false),  -- [CLONE] AJUSTAR PARA O CLIENTE
  ('Equipamento', '4742-3/00', 'I',   false),  -- [CLONE] AJUSTAR PARA O CLIENTE
  ('Comissão',    '7490-1/04', 'V',   true)    -- [CLONE] AJUSTAR PARA O CLIENTE
ON CONFLICT (cnae) DO NOTHING;

CREATE TABLE IF NOT EXISTS financeiro_receita_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL,
  atividade_id uuid REFERENCES financeiro_atividades(id) ON DELETE SET NULL,
  receita numeric(14,2) NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'sistema',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_receita_competencia_check CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_receita_comp_ativ
  ON financeiro_receita_mensal(competencia, COALESCE(atividade_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS financeiro_contas_a_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  atividade_id uuid REFERENCES financeiro_atividades(id) ON DELETE SET NULL,
  descricao text,
  valor numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  valor_recebido numeric(14,2) NOT NULL DEFAULT 0,
  data_recebimento date,
  competencia_recebimento text,
  imposto_provisorio numeric(14,2),
  imposto_confirmado numeric(14,2),
  anexo_aplicado text,
  aliquota_efetiva numeric(7,4),
  faixa int,
  rbt12_no_calculo numeric(14,2),
  fator_r_no_calculo numeric(7,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT fin_contas_status_check
    CHECK (status IN ('pendente','recebido_parcial','recebido','cancelado')),
  CONSTRAINT fin_contas_competencia_check
    CHECK (competencia_recebimento IS NULL OR competencia_recebimento ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX IF NOT EXISTS idx_fin_contas_status ON financeiro_contas_a_receber(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_contas_comp ON financeiro_contas_a_receber(competencia_recebimento);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_contas_fechamento_unq
  ON financeiro_contas_a_receber(fechamento_id)
  WHERE fechamento_id IS NOT NULL AND status <> 'cancelado';

CREATE TABLE IF NOT EXISTS financeiro_parametros (
  id int PRIMARY KEY DEFAULT 1,
  razao_social text,
  cnpj text,
  pro_labore_mensal numeric(14,2) NOT NULL DEFAULT 0,
  outras_folhas_mensal numeric(14,2) NOT NULL DEFAULT 0,
  dia_alerta_das int NOT NULL DEFAULT 15,
  dia_vencimento_das int NOT NULL DEFAULT 20,
  margem_alerta_faixa numeric(14,2) NOT NULL DEFAULT 20000,
  fator_r_alerta numeric(7,4) NOT NULL DEFAULT 0.30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_parametros_singleton CHECK (id = 1)
);
-- [CLONE-006] AJUSTAR PARA O CLIENTE — razão social e CNPJ abaixo são da EcoSunPower.
-- Antes de rodar: substituir pelos dados do cliente, OU atualizar depois com:
--   UPDATE financeiro_parametros SET razao_social='...', cnpj='...' WHERE id=1;
INSERT INTO financeiro_parametros (id, razao_social, cnpj)
  VALUES (1, 'ECOSUNPOWER ENERGIA SOLAR LTDA', '33.020.459/0001-06') -- [CLONE] AJUSTAR PARA O CLIENTE
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS financeiro_recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id uuid NOT NULL REFERENCES financeiro_contas_a_receber(id) ON DELETE CASCADE,
  valor numeric(14,2) NOT NULL,
  imposto numeric(14,2) NOT NULL,
  anexo_aplicado text,
  aliquota_efetiva numeric(7,4),
  competencia text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_receb_competencia_check CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX IF NOT EXISTS idx_fin_receb_comp ON financeiro_recebimentos(competencia);
CREATE INDEX IF NOT EXISTS idx_fin_receb_conta ON financeiro_recebimentos(conta_id);

CREATE OR REPLACE FUNCTION fin_somar_receita_mes(p_competencia text, p_atividade_id uuid, p_valor numeric)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO financeiro_receita_mensal (competencia, atividade_id, receita, origem)
  VALUES (p_competencia, p_atividade_id, p_valor, 'sistema')
  ON CONFLICT (competencia, COALESCE(atividade_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET receita = financeiro_receita_mensal.receita + EXCLUDED.receita,
                updated_at = now();
$$;


-- ============ migration 047: financeiro_caixa_entrada ============

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS financeiro_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- [CLONE-008] Categorias genéricas de despesa. Reutilizáveis para qualquer empresa.
-- Adicionar/remover categorias conforme necessidade do cliente.
INSERT INTO financeiro_categorias (slug, nome) VALUES
  ('combustivel', 'Combustível'),                    -- [CLONE] AJUSTAR PARA O CLIENTE
  ('material_eletrico', 'Material elétrico'),         -- [CLONE] AJUSTAR PARA O CLIENTE
  ('equipamento_kit', 'Equipamento/Kit'),             -- [CLONE] AJUSTAR PARA O CLIENTE
  ('mao_de_obra', 'Mão de obra'),                    -- [CLONE] AJUSTAR PARA O CLIENTE
  ('alimentacao', 'Alimentação'),                     -- [CLONE] AJUSTAR PARA O CLIENTE
  ('ferramenta', 'Ferramenta'),                      -- [CLONE] AJUSTAR PARA O CLIENTE
  ('veiculo_manutencao', 'Veículo/Manutenção'),      -- [CLONE] AJUSTAR PARA O CLIENTE
  ('marketing_ads', 'Marketing/Anúncios'),            -- [CLONE] AJUSTAR PARA O CLIENTE
  ('software_assinatura', 'Software/Assinatura'),     -- [CLONE] AJUSTAR PARA O CLIENTE
  ('imposto_das', 'Imposto/DAS'),                    -- [CLONE] AJUSTAR PARA O CLIENTE
  ('pro_labore', 'Pró-labore'),                      -- [CLONE] AJUSTAR PARA O CLIENTE
  ('taxa_bancaria', 'Taxa bancária'),                 -- [CLONE] AJUSTAR PARA O CLIENTE
  ('outros', 'Outros')                               -- [CLONE] AJUSTAR PARA O CLIENTE
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL
    CHECK (tipo IN ('despesa', 'entrada')),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'confirmado', 'apagado')),
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  data_evento date NOT NULL,
  competencia text NOT NULL
    CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  contraparte text,
  descricao text,
  categoria_id uuid REFERENCES financeiro_categorias(id) ON DELETE SET NULL,
  pf_pj text CHECK (pf_pj IN ('PF', 'PJ')),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  fechamento_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL,
  conta_id uuid REFERENCES financeiro_contas_a_receber(id) ON DELETE SET NULL,
  storage_path text,
  mime_type text,
  origem text NOT NULL
    CHECK (origem IN ('zap_midia', 'zap_texto')),
  message_id text,
  extracao jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_lanc_status
  ON financeiro_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_competencia
  ON financeiro_lancamentos(competencia);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_tipo_comp
  ON financeiro_lancamentos(tipo, competencia);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_categoria
  ON financeiro_lancamentos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_pfpj_comp
  ON financeiro_lancamentos(pf_pj, competencia);


-- ============ migration 048: monitoring_abordagens ============

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS monitoring_abordagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id uuid NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  alerta_id uuid REFERENCES monitoring_alerts(id) ON DELETE SET NULL,
  tipo text NOT NULL
    CHECK (tipo IN ('parabens', 'depoimento', 'queda', 'offline')),
  etapa int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'proposta'
    CHECK (status IN ('proposta', 'aguardando_aprovacao', 'enviada',
                      'em_conversa', 'lembrete_enviado', 'encerrada')),
  desfecho text
    CHECK (desfecho IN ('resolvido_sozinho', 'limpeza_fechada',
                        'visita_agendada', 'transferido_junior',
                        'sem_resposta', 'descartada_junior')),
  causa_raiz text,
  mensagem_proposta text,
  mensagem_enviada text,
  resposta_resumo text,
  nota_junior text CHECK (nota_junior IN ('boa', 'errou')),
  nota_observacao text,
  reagendada_para timestamptz,
  enviada_em timestamptz,
  lembrete_em timestamptz,
  ultima_resposta_cliente_em timestamptz,
  encerrada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mab_uma_ativa_por_usina
  ON monitoring_abordagens(sistema_id)
  WHERE status <> 'encerrada';
CREATE INDEX IF NOT EXISTS idx_mab_status ON monitoring_abordagens(status);
CREATE INDEX IF NOT EXISTS idx_mab_lead ON monitoring_abordagens(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mab_sistema ON monitoring_abordagens(sistema_id, created_at DESC);

CREATE TABLE IF NOT EXISTS monitoring_treino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text CHECK (tipo IN ('parabens', 'depoimento', 'queda', 'offline')),
  instrucao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitoring_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  parabens_auto boolean NOT NULL DEFAULT false,
  queda_auto boolean NOT NULL DEFAULT false,
  offline_auto boolean NOT NULL DEFAULT false,
  template_nome text NOT NULL DEFAULT 'eva_monitoramento_v1',
  template_bloqueio_avisado boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO monitoring_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;


-- ============ migration 049: empresa_config ============

-- [CLONE-009] ⚠️ SEED ADAPTADO: a migration original semeia os dados REAIS da
-- EcoSunPower (cliente nº 0). Aqui o seed usa PLACEHOLDERS — edite TODOS os
-- campos [CONFIGURAR] com os dados do cliente ANTES de ativar o clone.
-- Enquanto razao_social mostrar [CONFIGURAR], o clone NÃO está pronto.

CREATE TABLE IF NOT EXISTS empresa_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- identidade
  razao_social text NOT NULL,
  nome_fantasia text NOT NULL,
  cnpj text NOT NULL,
  endereco text NOT NULL,
  cidade text NOT NULL,
  uf text NOT NULL,
  cep text,
  email text NOT NULL,
  site_url text NOT NULL,
  atuacao_desde int NOT NULL DEFAULT 2019,
  -- Campos que entram em prompt da Eva — limite de tamanho evita injeção de
  -- texto gigante via SQL Editor degradando/poluindo o prompt.
  descricao_curta text NOT NULL CHECK (char_length(descricao_curta) <= 500),
  regiao_atuacao text NOT NULL CHECK (char_length(regiao_atuacao) <= 500),
  -- atendente IA
  nome_atendente text NOT NULL DEFAULT 'Eva' CHECK (char_length(nome_atendente) <= 40),
  telefone_atendente text,                  -- chip do WhatsApp do negócio (wa.me)
  -- responsável técnico
  rt_nome text NOT NULL,
  rt_titulo text NOT NULL DEFAULT 'Responsável Técnico CREA/CFT' CHECK (char_length(rt_titulo) <= 80),
  rt_cpf text,
  rt_rg text,
  rt_registro text,
  -- comercial
  pix_chave text,
  criterio_lead_valor numeric(10,2) NOT NULL DEFAULT 700 CHECK (criterio_lead_valor >= 0),
  criterio_lead_kwh numeric(10,2) NOT NULL DEFAULT 700 CHECK (criterio_lead_kwh >= 0),
  marcas_permitidas text[] NOT NULL DEFAULT '{}',
  marcas_bloqueadas text[] NOT NULL DEFAULT '{}',
  garantia_instalacao_meses int NOT NULL DEFAULT 12,
  fator_perda_padrao numeric(4,2) NOT NULL DEFAULT 0.78 CHECK (fator_perda_padrao > 0 AND fator_perda_padrao <= 1),
  belenus_ativo boolean NOT NULL DEFAULT false,  -- tabela de cartão específica da EcoSun (clone: deixar FALSE)
  -- região técnica (fallback quando a UF do cliente NÃO está no solar-params)
  hsp_padrao numeric(4,2) CHECK (hsp_padrao > 0),                   -- ex.: 5.40; null = usa o resolver atual por UF
  tarifa_kwh_padrao numeric(6,3) CHECK (tarifa_kwh_padrao > 0),     -- ex.: 1.050; null = resolver atual
  concessionaria_padrao text,                                        -- ex.: 'CEMIG-MG'; null = resolver atual
  -- branding
  logo_storage_path text,                    -- bucket 'branding'; null = logo embutida (fallback)
  updated_at timestamptz NOT NULL DEFAULT now() -- sem trigger: editou via SQL Editor, atualize na mão (ou ignore o campo)
);

-- [CLONE-009] Seed com PLACEHOLDERS (a migration original usa os dados da EcoSunPower).
INSERT INTO empresa_config (
  id, razao_social, nome_fantasia, cnpj, endereco, cidade, uf, cep, email, site_url,
  atuacao_desde, descricao_curta, regiao_atuacao, nome_atendente, telefone_atendente,
  rt_nome, rt_titulo, rt_cpf, rt_rg, rt_registro, pix_chave,
  criterio_lead_valor, criterio_lead_kwh, marcas_permitidas, marcas_bloqueadas,
  garantia_instalacao_meses, fator_perda_padrao, belenus_ativo,
  hsp_padrao, tarifa_kwh_padrao, concessionaria_padrao
) VALUES (
  1,
  '[CONFIGURAR] RAZAO SOCIAL DO CLIENTE LTDA',          -- [CLONE] OBRIGATÓRIO editar antes de usar
  '[CONFIGURAR] Nome Fantasia',                          -- [CLONE] OBRIGATÓRIO editar antes de usar
  '00.000.000/0000-00',                                  -- [CLONE] OBRIGATÓRIO editar antes de usar (CNPJ do cliente)
  '[CONFIGURAR] Endereço completo',                      -- [CLONE] OBRIGATÓRIO editar antes de usar
  '[CONFIGURAR] Cidade',                                 -- [CLONE] OBRIGATÓRIO editar antes de usar
  'XX',                                                  -- [CLONE] OBRIGATÓRIO editar antes de usar (UF, 2 letras)
  NULL,                                                  -- [CLONE] cep (opcional)
  'configurar@cliente.com.br',                           -- [CLONE] OBRIGATÓRIO editar antes de usar
  'https://configurar.cliente.com.br',                   -- [CLONE] OBRIGATÓRIO editar antes de usar
  2019,                                                  -- [CLONE] OBRIGATÓRIO editar antes de usar (ano de início do cliente)
  '[CONFIGURAR] descreva a empresa',                     -- [CLONE] OBRIGATÓRIO editar antes de usar
  '[CONFIGURAR] região de atuação',                      -- [CLONE] OBRIGATÓRIO editar antes de usar
  'Eva',                                                 -- [CLONE] nome da atendente IA (personalizável)
  NULL,                                                  -- [CLONE] OBRIGATÓRIO editar antes de usar (chip WhatsApp do negócio)
  '[CONFIGURAR] NOME DO RESPONSAVEL TECNICO',            -- [CLONE] OBRIGATÓRIO editar antes de usar
  'Responsável Técnico CREA/CFT',                        -- [CLONE] título do RT (ajustar se necessário)
  NULL, NULL, NULL,                                      -- [CLONE] OBRIGATÓRIO editar antes de usar (rt_cpf, rt_rg, rt_registro)
  NULL,                                                  -- [CLONE] OBRIGATÓRIO editar antes de usar (pix_chave)
  700, 700,                                              -- [CLONE] critério mínimo de lead (R$ / kWh) — ajustar pro cliente
  '{}',                                                  -- [CLONE] OBRIGATÓRIO editar antes de usar (marcas_permitidas do cliente)
  '{}',                                                  -- [CLONE] marcas_bloqueadas (opcional)
  12, 0.78, FALSE,                                       -- [CLONE] garantia/fator de perda/belenus (belenus SEMPRE false no clone)
  NULL, NULL, NULL                                       -- [CLONE] OBRIGATÓRIO revisar (hsp_padrao, tarifa_kwh_padrao, concessionaria_padrao da região do cliente)
) ON CONFLICT (id) DO NOTHING;

-- Kits comerciais (preço é DO CLIENTE)
CREATE TABLE IF NOT EXISTS empresa_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem int NOT NULL,
  kwp numeric(6,2) NOT NULL CHECK (kwp > 0),
  modulos int NOT NULL CHECK (modulos > 0),
  microinversores int,
  geracao_kwh_mes numeric(8,1) NOT NULL CHECK (geracao_kwh_mes > 0),
  preco_brl numeric(12,2) NOT NULL CHECK (preco_brl > 0),
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now() -- sem trigger: editou via SQL Editor, atualize na mão (ou ignore o campo)
);

-- Índice único parcial: dentro dos kits ativos, a ordem é única.
-- Kits inativos podem reusar números de ordem sem conflito.
CREATE UNIQUE INDEX IF NOT EXISTS idx_empresa_kits_ordem_ativo ON empresa_kits (ordem) WHERE ativo;

-- [CLONE-009] SEM seed de kits — os preços da migration original são da EcoSunPower.
-- [CLONE] cadastre os kits do cliente em empresa_kits


-- =============================================================================
-- BLOCO DE VERIFICAÇÃO
-- =============================================================================
-- Cole e execute separadamente após o script principal para confirmar sucesso.
-- =============================================================================

-- Contagem de tabelas criadas no schema public
-- Esperado: 48 tabelas (número exato depende do Supabase — inclui tabelas internas)
SELECT count(*) AS total_tabelas
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- Tabelas esperadas (43 tabelas de negócio):
-- leads, conversations, dossiers, engineers, logs
-- learning_insights, conversation_patterns
-- followups, marketing_drafts, app_flags
-- reengagement_touches, post_install_touches, meta_leadgen_events
-- testimonials, eva_intro_pending, maintenance_reminders
-- eva_cadence, blog_drafts, propostas_publicas
-- external_articles, proposta_attachments, proposta_visualizacoes
-- sistemas_clientes, geracao_diaria, alertas_sistema
-- marketing_personas, marketing_creatives, marketing_creative_logs
-- marketing_campaigns, marketing_campaign_logs, meta_ads_insights
-- dm_threads, dm_messages, marketing_alerts
-- eva_knowledge_chunks, relatorio_slugs, monitoring_alerts
-- lead_anexos, relatorios_pos_instalacao, channel_daily_metrics
-- fechamentos, monitoring_abordagens, monitoring_treino, monitoring_config
-- financeiro_anexos, financeiro_atividades, financeiro_receita_mensal
-- financeiro_contas_a_receber, financeiro_parametros, financeiro_recebimentos
-- financeiro_categorias, financeiro_lancamentos
-- empresa_config, empresa_kits

-- Sanity checks de seeds obrigatórios
SELECT count(*) AS financeiro_anexos_count FROM financeiro_anexos;
-- Esperado: 30 (5 anexos × 6 faixas)

SELECT count(*) AS financeiro_atividades_count FROM financeiro_atividades;
-- Esperado: 3 (Instalação, Equipamento, Comissão)

SELECT count(*) AS financeiro_categorias_count FROM financeiro_categorias;
-- Esperado: 13

SELECT * FROM financeiro_parametros;
-- Esperado: 1 linha com razao_social e cnpj (ajustar se necessário — ver [CLONE-006])

SELECT id FROM monitoring_config;
-- Esperado: 1 linha com id=1

SELECT razao_social FROM empresa_config WHERE id = 1;
-- Esperado: 1 linha. Se mostrar [CONFIGURAR], EDITE os dados do cliente em
-- empresa_config (e cadastre os kits em empresa_kits) ANTES de ativar o clone.

-- Verificar extensões instaladas
SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'vector');
-- Esperado: pgcrypto e vector

-- Verificar funções criadas pelas migrations
SELECT proname FROM pg_proc
WHERE proname IN ('normalize_email_lower', 'match_eva_chunks', 'increment_pi_access', 'fin_somar_receita_mes');
-- Esperado: 4 funções

-- Verificar buckets de storage (migrations 004 e 006)
SELECT id, name, public FROM storage.buckets WHERE id IN ('marketing-images', 'marketing-videos');
-- Esperado: 2 linhas, ambos public=true
