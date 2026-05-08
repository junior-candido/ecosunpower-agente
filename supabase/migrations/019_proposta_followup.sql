-- Migration 019: Follow-up automatico de proposta
--
-- Adiciona colunas pra rastrear o ciclo de engajamento pos-envio da proposta:
-- 1. cliente abre o link publico (acessos > 0)
-- 2. Eva manda mensagem pro cliente (followup_sent_at)
-- 3. cliente responde a Eva (cliente_respondeu_at)
--
-- Permite ao dashboard mostrar status por proposta:
--   📤 Enviada (acessos = 0)
--   👁 Visualizada (acessos > 0, followup_sent_at NULL)
--   💬 Eva engajou (followup_sent_at setado)
--   ✉️ Cliente respondeu (cliente_respondeu_at setado)

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cliente_respondeu_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_skipped_reason text;

COMMENT ON COLUMN propostas_publicas.followup_sent_at IS
  'Timestamp da mensagem automatica que a Eva enviou pro cliente apos detectar primeiro acesso ao link.';

COMMENT ON COLUMN propostas_publicas.cliente_respondeu_at IS
  'Timestamp da primeira resposta do cliente apos receber a mensagem de followup.';

COMMENT ON COLUMN propostas_publicas.followup_skipped_reason IS
  'Razao pela qual followup nao foi enviado (ex: telefone vazio, fora janela 24h, WABA indisponivel).';

-- Index pra dashboard buscar propostas que precisam de followup
CREATE INDEX IF NOT EXISTS idx_propostas_publicas_followup_status
  ON propostas_publicas(followup_sent_at, cliente_respondeu_at)
  WHERE NOT revoked;
