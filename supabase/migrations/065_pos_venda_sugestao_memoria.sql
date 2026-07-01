-- Memória da SUGESTÃO do pós-venda por (cliente, situação). O que já foi ENVIADO
-- vive em abordagens; aqui guardamos o que foi SUGERIDO/DISPENSADO + o cooldown
-- (snoozed_until), pra sugestão não repetir a mesma dica todo dia.
--
-- Aditiva: NÃO altera nenhuma tabela existente. Depoimento NÃO entra aqui (é manual).

CREATE TABLE IF NOT EXISTS pos_venda_sugestao_memoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sistema_id    uuid REFERENCES sistemas_clientes(id) ON DELETE SET NULL,
  tipo          text NOT NULL CHECK (tipo IN ('geracao_saudavel','queda','marco','upgrade','contato')),
  ultima_sugerida_em timestamptz,
  ultima_acao   text CHECK (ultima_acao IN ('enviada','dispensada')),
  ultima_acao_em timestamptz,
  snoozed_until timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_pv_sug_memoria_lead ON pos_venda_sugestao_memoria(lead_id);
