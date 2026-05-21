-- Migration 035: propostas_publicas.sent_to_client_at
-- Marca quando a proposta foi efetivamente enviada pelo WhatsApp pro cliente.
-- Usado pela tela admin A4 pra mostrar badge "Enviado" e bloquear reenvio acidental.

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS sent_to_client_at timestamptz;

COMMENT ON COLUMN propostas_publicas.sent_to_client_at
  IS 'Timestamp do clique em "Enviar pelo WhatsApp" na tela admin A4. NULL = ainda nao enviado.';
