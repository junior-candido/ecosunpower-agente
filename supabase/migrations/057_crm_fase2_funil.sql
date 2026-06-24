-- 057_crm_fase2_funil.sql — CRM Fase 2: funil automatizado (timeline + tarefas/SLA)
-- Depende de: 056 (companies, dashboard_users, audit_log, leads.claimed_by/last_contact_at)

-- 1) Etapas novas no enum do funil (idempotente). Leads existentes mantêm o valor atual.
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'proposta_enviada';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'negociacao';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'ganho';

-- 2) Timeline do lead
CREATE TABLE IF NOT EXISTS lead_atividades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo        text NOT NULL,
  titulo      text NOT NULL,
  descricao   text,
  automatica  boolean NOT NULL DEFAULT true,
  user_id     uuid REFERENCES dashboard_users(id) ON DELETE SET NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_atividades_lead ON lead_atividades(lead_id, created_at DESC);

-- 3) Tarefas / SLA do lead
CREATE TABLE IF NOT EXISTS lead_tarefas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  titulo        text NOT NULL,
  tipo          text NOT NULL DEFAULT 'custom',
  due_at        timestamptz,
  prioridade    text NOT NULL DEFAULT 'media',
  status        text NOT NULL DEFAULT 'pendente',
  automatica    boolean NOT NULL DEFAULT false,
  etapa_origem  text,
  assigned_to   uuid REFERENCES dashboard_users(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES dashboard_users(id) ON DELETE SET NULL,
  completed_at  timestamptz,
  alert_sent_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_tarefas_lead   ON lead_tarefas(lead_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_tarefas_due    ON lead_tarefas(status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_tarefa_auto
  ON lead_tarefas(lead_id, tipo, etapa_origem)
  WHERE automatica AND status = 'pendente';

-- 4) RLS (defesa em profundidade; app filtra por company_id e o dashboard usa service-role)
ALTER TABLE lead_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tarefas    ENABLE ROW LEVEL SECURITY;
