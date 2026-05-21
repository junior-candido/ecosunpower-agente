-- supabase/migrations/034_relatorios_pos_instalacao.sql
-- A5 — Relatório Pós-Instalação Automático
-- Spec: docs/superpowers/specs/2026-05-20-a5-relatorio-pos-instalacao-design.md

alter table leads add column if not exists post_install_report_sent_at timestamptz;

create table relatorios_pos_instalacao (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  slug text not null unique,
  mensagem_personalizada text,
  data_instalacao date,
  fotos jsonb not null default '[]',
  enviado_em timestamptz,
  enviado_para_phone text,
  acessos integer not null default 0,
  ultimo_acesso_em timestamptz,
  created_at timestamptz not null default now(),
  created_by text default 'junior'
);

create index relatorios_pi_by_lead on relatorios_pos_instalacao (lead_id, created_at desc);
create index relatorios_pi_slug on relatorios_pos_instalacao (slug);

-- Increment atômico de acessos (evita race condition em concurrent reads)
create or replace function increment_pi_access(p_slug text)
returns void language sql security definer as $$
  update relatorios_pos_instalacao
  set acessos = acessos + 1, ultimo_acesso_em = now()
  where slug = p_slug;
$$;
