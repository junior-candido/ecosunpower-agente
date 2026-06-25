-- Migration 061: lead_ia_conversas — histórico do copiloto de IA por lead
--
-- Guarda a conversa do vendedor com a IA assistente, POR LEAD. Vira histórico
-- (continuar de onde parou), material de treinamento de vendas e análise/feedback.
-- role = 'user' (pergunta do vendedor) ou 'assistant' (resposta da IA).

CREATE TABLE IF NOT EXISTS lead_ia_conversas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  conteudo    text NOT NULL,
  -- Quem perguntou (vendedor). NULL nas mensagens da IA (assistant).
  user_id     uuid REFERENCES dashboard_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Lê a conversa de um lead em ordem cronológica.
CREATE INDEX IF NOT EXISTS idx_lead_ia_conversas_lead
  ON lead_ia_conversas(lead_id, created_at);

ALTER TABLE lead_ia_conversas ENABLE ROW LEVEL SECURITY;
