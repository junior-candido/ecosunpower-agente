-- supabase/migrations/098_pastas_cliente.sql
-- Pasta Digital do Cliente (entrega pós-instalação)
-- Spec: docs/superpowers/specs/2026-08-05-pasta-digital-cliente-design.md

create table pastas_cliente (
  id uuid primary key default gen_random_uuid(),
  -- Fundação multi-tenant (079/089): nasce carimbada EcoSun; tenant real
  -- entra quando a pasta virar módulo do cardápio dos tenants.
  company_id uuid references companies(id) default '00000000-0000-0000-0000-000000000001',
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

-- RLS: política padrão da casa (079/089/092). O app usa service role (bypassa
-- RLS); a política protege acesso direto com JWT de tenant.
ALTER TABLE pastas_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastas_cliente FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON pastas_cliente;
CREATE POLICY company_isolation ON pastas_cliente
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- Increment atômico de acessos (mesmo padrão do increment_pi_access da 034)
create or replace function increment_pasta_access(p_slug text)
returns void language sql security definer as $$
  update pastas_cliente
  set acessos = acessos + 1, ultimo_acesso_em = now()
  where slug = p_slug;
$$;
