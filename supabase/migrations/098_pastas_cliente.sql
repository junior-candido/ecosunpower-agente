-- supabase/migrations/098_pastas_cliente.sql
-- Pasta Digital do Cliente (entrega pós-instalação)
-- Spec: docs/superpowers/specs/2026-08-05-pasta-digital-cliente-design.md

create table pastas_cliente (
  id uuid primary key default gen_random_uuid(),
  -- UMA pasta por lead (unique) — editar a existente em vez de duplicar
  lead_id uuid not null unique references leads(id) on delete cascade,
  slug text not null unique,
  status text not null default 'rascunho',       -- rascunho | publicada
  capa_storage_path text,
  data_entrega date,
  mensagem_zap text,
  -- cada item: { secao: 'fotos'|'projeto'|'art'|'homologacao'|'manuais'|'garantia'|'contrato',
  --              storage_path, nome_exibicao, caption?, origem?: 'upload'|'r-pi' }
  arquivos jsonb not null default '[]',
  acessos integer not null default 0,
  ultimo_acesso_em timestamptz,
  enviado_em timestamptz,
  enviado_para_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'junior'
);

-- Increment atômico de acessos (mesmo padrão do increment_pi_access da 034)
create or replace function increment_pasta_access(p_slug text)
returns void language sql security definer as $$
  update pastas_cliente
  set acessos = acessos + 1, ultimo_acesso_em = now()
  where slug = p_slug;
$$;
