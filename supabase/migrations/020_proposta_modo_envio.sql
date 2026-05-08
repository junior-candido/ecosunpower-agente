-- Migration 020: salvar modo_envio em propostas_publicas
--
-- Permite ao followup automatico decidir se Eva manda direto ou avisa Junior.
-- Valores:
--   'junior_envia' = Junior mandou a proposta manual; Eva NAO deve mandar
--                    follow-up direto (cliente nao conhece numero da Eva).
--                    Em vez disso, Eva pergunta a Junior o que fazer.
--   'eva_envia' = Eva mandou a proposta direto pelo numero WABA. Cliente
--                  ja conhece o numero. Follow-up automatico OK.
--
-- Default 'junior_envia' (mais conservador) pra propostas antigas que nao tem
-- esse campo setado.

ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS modo_envio text;

COMMENT ON COLUMN propostas_publicas.modo_envio IS
  'Modo escolhido pra enviar proposta: junior_envia (manual) ou eva_envia (automatico). Define comportamento do followup automatico.';
