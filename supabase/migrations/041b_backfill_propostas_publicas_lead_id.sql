-- supabase/migrations/041b_backfill_propostas_publicas_lead_id.sql
-- ATENCAO: rodar UMA UNICA VEZ apos 041 ser aplicada.
-- Vincula propostas existentes ao lead pelo telefone normalizado.
-- Propostas sem telefone (caso Fernanda) ficam orfas ate primeira execucao
-- de /procuracao ou /contrato pra aquele cliente.

UPDATE propostas_publicas pp
SET lead_id = l.id
FROM leads l
WHERE pp.lead_id IS NULL
  AND l.phone = pp.cliente_telefone
  AND pp.cliente_telefone IS NOT NULL;

-- Verificacao (rodar separado pra conferir resultado):
-- SELECT count(*) FILTER (WHERE lead_id IS NOT NULL) AS linkadas,
--        count(*) FILTER (WHERE lead_id IS NULL) AS orfas
-- FROM propostas_publicas;
