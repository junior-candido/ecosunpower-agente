-- supabase/migrations/032_monitoring_alerts.sql
-- Modulo 6: alerta proativo da carteira
-- Spec: docs/superpowers/specs/2026-05-20-modulo-6-alerta-proativo-design.md

create table monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  sistema_id uuid not null references sistemas(id) on delete cascade,
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
