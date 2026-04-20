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
