-- Slugs de relatório de usina (link público /r/:slug, TTL 60 dias).
create table if not exists relatorio_slugs (
  slug text primary key,
  sistema_id uuid not null references sistemas_clientes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);
create index if not exists idx_relatorio_slugs_sistema on relatorio_slugs(sistema_id);
