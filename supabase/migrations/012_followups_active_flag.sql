-- Migration 012: active flag em followups pra preservar historico
-- Reset de cadencia soft-deleta (active=false) em vez de DELETE.
-- Mantem audit pra debug/compliance.

alter table followups add column if not exists active boolean not null default true;

create index if not exists idx_followups_active_lead
  on followups(lead_id, step desc) where active = true;
