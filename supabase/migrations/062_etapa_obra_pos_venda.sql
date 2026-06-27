-- Migration 062: adiciona 'pos_venda' como estado terminal de etapa_obra.
-- Usina que concluiu a obra (ou que já opera) sai do kanban e passa a ser
-- gerida na tela de Pós-venda. 'pos_venda' NÃO entra em ETAPAS_USINA, então o
-- kanban (agruparUsinasPorEtapaObra) a ignora automaticamente e ela some das
-- colunas. O Pós-venda lista por lead_id, então continua mostrando.
ALTER TABLE sistemas_clientes
  DROP CONSTRAINT IF EXISTS sistemas_clientes_etapa_obra_check;

ALTER TABLE sistemas_clientes
  ADD CONSTRAINT sistemas_clientes_etapa_obra_check
  CHECK (etapa_obra IN (
    'projeto','aprovacao','instalacao','vistoria','homologacao','operacao','pos_venda'
  ));
