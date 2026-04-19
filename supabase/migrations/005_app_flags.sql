-- Simple key/value table for app-level flags (e.g. last_weekly_marketing_run)
create table if not exists app_flags (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_flags enable row level security;
