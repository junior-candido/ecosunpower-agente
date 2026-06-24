-- Migration 056: Fundacao do CRM (multiusuario, permissoes, claim, auditoria, multi-tenant)
-- Cria companies/dashboard_roles/dashboard_users/audit_log + colunas de posse em leads.
-- Idempotente (IF NOT EXISTS) pra rodar 2x sem quebrar.

-- 1) Empresas (multi-tenant). Semente: EcoSunPower.
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO companies (id, nome)
VALUES ('00000000-0000-0000-0000-000000000001', 'EcoSunPower')
ON CONFLICT (id) DO NOTHING;

-- 2) Papeis (permissoes por area, configuravel sem codigo).
-- permissoes = jsonb { area: [niveis] }. is_admin=true ignora o mapa e libera tudo.
CREATE TABLE IF NOT EXISTS dashboard_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  nome text NOT NULL,
  permissoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, nome)
);

-- Papeis-semente da EcoSun. Areas: leads, propostas, usinas, financeiro, marketing,
-- relatorios, usuarios, configuracoes. Niveis: visualizar, criar, editar, excluir, exportar, administrar.
INSERT INTO dashboard_roles (company_id, nome, is_admin, permissoes) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Administrador', true, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Comercial', false, '{
    "leads":["visualizar","criar","editar","exportar"],
    "propostas":["visualizar","criar","editar"],
    "usinas":["visualizar"],
    "relatorios":["visualizar"]
  }'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Pos-venda', false, '{
    "leads":["visualizar"],
    "usinas":["visualizar","editar"],
    "relatorios":["visualizar"]
  }'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Financeiro', false, '{
    "financeiro":["visualizar","editar","exportar"],
    "relatorios":["visualizar","exportar"]
  }'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Engenharia', false, '{
    "usinas":["visualizar","criar","editar"],
    "propostas":["visualizar"]
  }'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Instalacao', false, '{
    "usinas":["visualizar","editar"]
  }'::jsonb)
ON CONFLICT (company_id, nome) DO NOTHING;

-- 3) Usuarios do dashboard (login por pessoa).
CREATE TABLE IF NOT EXISTS dashboard_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  nome text NOT NULL,
  login text NOT NULL,
  senha_hash text,
  role_id uuid REFERENCES dashboard_roles(id),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (company_id, login)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_users_login ON dashboard_users(company_id, login);

-- 4) Auditoria de acoes.
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id uuid REFERENCES dashboard_users(id),
  entidade text NOT NULL,
  entidade_id text,
  acao text NOT NULL,
  campo text,
  valor_antigo text,
  valor_novo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entidade ON audit_log(entidade, entidade_id, created_at DESC);

-- 5) Posse de lead (claim) + SLA. company_id pra multi-tenant.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES dashboard_users(id),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;

-- Backfill: todos os leads existentes pertencem a EcoSun.
UPDATE leads SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_claimed_by ON leads(claimed_by);

COMMENT ON TABLE dashboard_roles IS 'Papeis com permissoes por area (jsonb). is_admin=true libera tudo.';
COMMENT ON COLUMN leads.claimed_by IS 'Vendedor dono do lead (pool+claim). NULL=no balcao.';
