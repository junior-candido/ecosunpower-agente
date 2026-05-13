-- Mapping campanha Meta -> template WABA inicial.
--
-- Pra A/B test entre templates Utility no auto-ack de primeira sessao
-- (eva_qualificacao_v1 vs eva_curiosidade_v1, e futuros).
--
-- Quando lead vem com ad_campaign_id batendo com acquisition_campaign_id da
-- marketing_campaigns, o auto-ack busca template_inicial dessa campanha e
-- usa em vez do default global. Se nao houver mapping ou campanha
-- desconhecida, fallback pro default global (eva_resposta_inicial agora, e
-- eva_qualificacao_v1 depois que Roberto aprovar).
--
-- Campo opcional — campanhas existentes mantem comportamento atual via
-- fallback. Implantar sem migration de dados necessaria.

ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS template_inicial TEXT;

COMMENT ON COLUMN marketing_campaigns.template_inicial IS
  'Nome do template WABA usado no auto-ack quando lead vem dessa campanha. NULL = usa template default global. Ex: eva_qualificacao_v1, eva_curiosidade_v1';
