-- Migration 014: Cadencia de reengajamento (5 toques: 0h, 15d, 30d, 45d, 60d)
--
-- Fluxo:
-- 1. Contato e ativado (eva_active=true) + cadencia agendada via scheduleCadence
-- 2. Scheduler roda a cada 15min, processa toques maduros (scheduled_for <= now)
--    dentro do horario comercial (9h-20h BRT)
-- 3. Claude Haiku gera mensagem natural baseada no step (1-5) + nome do cliente
-- 4. Se cliente responder em qualquer ponto, cadencia e cancelada
--    (toques remanescentes marcados como 'cancelled') e Eva entra em modo conversa normal

create table if not exists eva_cadence (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  step int not null check (step >= 1 and step <= 5),
  scheduled_for timestamptz not null,
  status text not null default 'pending',   -- 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed'
  sent_at timestamptz,
  message_sent text,                        -- texto enviado (audit)
  cancelled_reason text,                    -- 'client_replied' | 'eva_off' | 'maintenance_client' | 'superseded'
  error_message text,
  created_at timestamptz not null default now(),
  unique (lead_id, step)                    -- idempotencia por lead+step
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
