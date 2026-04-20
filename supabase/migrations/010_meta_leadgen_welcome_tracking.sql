-- Migration 010: rastreia envio da primeira mensagem proativa pra leads
-- vindos do Meta Lead Ads. Previne double-welcome quando mesmo telefone
-- cai em dois leadgen_ids diferentes (cliente preenche 2x) ou quando o
-- welcome ja foi enviado e o lead reengaja depois.

alter table leads add column if not exists welcome_sent_at timestamptz;

create index if not exists idx_leads_welcome_pending
  on leads(created_at)
  where welcome_sent_at is null and lead_source in ('ad_ig_leadform', 'ad_fb_leadform');
