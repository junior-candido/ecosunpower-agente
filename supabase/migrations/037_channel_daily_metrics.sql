-- S1 dashboard unificado: ponto único de métricas/dia por canal.
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
