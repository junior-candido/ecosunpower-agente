-- S1: canal canônico do lead (preenchido por resolveChannel).
alter table leads add column if not exists channel text;
create index if not exists idx_leads_channel on leads (channel);
