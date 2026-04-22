-- Migration 013: Eva-active flag, intro pendente e lembretes de manutencao
--
-- Mudanca importante de comportamento:
-- 1) Contatos JA EXISTENTES no banco passam a ter eva_active = false (Junior
--    libera 1 a 1 com /eva on quando quiser que Eva atenda).
-- 2) Contatos NOVOS (criados a partir desta migration) entram com
--    eva_active = true (default) — Eva responde automatico igual hoje.
-- 3) Comando /eva on agenda intro_pending (delay 2h) — se cliente nao
--    responder nesse intervalo, Eva manda mensagem de apresentacao.
-- 4) Comando /manutencao marca o lead como cliente de manutencao e cria
--    lembretes recorrentes em maio e agosto pra limpeza dos modulos.

-- =========================================================================
-- 1. Coluna eva_active em leads
-- =========================================================================

alter table leads add column if not exists eva_active boolean not null default true;

-- IMPORTANTE: marca leads JA existentes como inativos, MAS preserva os "quentes":
--   - leads em qualificacao ou agendados (Eva nao pode abandonar no meio)
--   - leads com conversa ativa nas ultimas 72h (cliente esta digitando agora)
-- Esses ficam eva_active = true. O resto vira false e Junior libera 1 a 1
-- com /eva on quando aparecer.
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

-- =========================================================================
-- 2. Cliente de manutencao + timestamp de quando Eva foi ativada
-- =========================================================================

alter table leads add column if not exists maintenance_client boolean not null default false;
alter table leads add column if not exists eva_activated_at timestamptz;

create index if not exists idx_leads_maintenance on leads(maintenance_client) where maintenance_client = true;

-- =========================================================================
-- 3. Tabela: pendencias de apresentacao da Eva (delay 2h apos /eva on)
-- =========================================================================

create table if not exists eva_intro_pending (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'pending',  -- 'pending' | 'sent' | 'cancelled'
  sent_at timestamptz,
  cancelled_reason text,                    -- 'client_replied' | 'human_intervened' | etc
  created_at timestamptz not null default now()
);

create index if not exists idx_eva_intro_pending_due
  on eva_intro_pending(scheduled_for) where status = 'pending';

create index if not exists idx_eva_intro_pending_lead
  on eva_intro_pending(lead_id, status);

-- =========================================================================
-- 4. Tabela: lembretes de manutencao (recorrentes anuais maio e agosto)
-- =========================================================================

create table if not exists maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  scheduled_date date not null,             -- a data do lembrete (sempre dia 1 de maio ou agosto)
  topic text not null,                      -- 'limpeza_maio' | 'limpeza_agosto'
  status text not null default 'pending',   -- 'pending' | 'sent' | 'failed' | 'skipped'
  sent_at timestamptz,
  message_sent text,                        -- texto enviado (pra audit)
  error_message text,
  created_at timestamptz not null default now(),
  unique (lead_id, scheduled_date, topic)
);

create index if not exists idx_maintenance_reminders_due
  on maintenance_reminders(scheduled_date) where status = 'pending';

create index if not exists idx_maintenance_reminders_lead
  on maintenance_reminders(lead_id, scheduled_date desc);

-- =========================================================================
-- 5. Comentarios pra documentacao no Supabase Studio
-- =========================================================================

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
