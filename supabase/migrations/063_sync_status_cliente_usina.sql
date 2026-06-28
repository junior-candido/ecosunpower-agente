-- Migration 063: interliga o status do CLIENTE com a etapa da USINA.
-- Antes: leads.installation_status (verdinho "operando"/"pós-venda" no CRM) era
-- editado na mão e não acompanhava a usina. Agora um gatilho sincroniza sozinho:
-- quando sistemas_clientes.etapa_obra muda (ou o dono é vinculado), o status do
-- cliente acompanha. Cobre TODOS os caminhos que mexem na etapa (vínculo,
-- importador, SQL em massa, fix do dono) — "interligado geral".
--
-- Mapa: etapa_obra 'pos_venda' -> cliente 'pos_venda_concluido';
--       etapa_obra 'operacao'  -> cliente 'operando'.
-- (As etapas anteriores à usina — lead/proposta/contrato — seguem manuais.)

CREATE OR REPLACE FUNCTION sync_installation_status_from_etapa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    IF NEW.etapa_obra = 'pos_venda' THEN
      UPDATE leads SET installation_status = 'pos_venda_concluido', updated_at = now()
       WHERE id = NEW.lead_id AND installation_status IS DISTINCT FROM 'pos_venda_concluido';
    ELSIF NEW.etapa_obra = 'operacao' THEN
      UPDATE leads SET installation_status = 'operando', updated_at = now()
       WHERE id = NEW.lead_id AND installation_status IS DISTINCT FROM 'operando';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Dispara quando a etapa OU o vínculo do cliente muda (vincular dono = ambos).
DROP TRIGGER IF EXISTS trg_sync_installation_status ON sistemas_clientes;
CREATE TRIGGER trg_sync_installation_status
  AFTER INSERT OR UPDATE OF etapa_obra, lead_id ON sistemas_clientes
  FOR EACH ROW EXECUTE FUNCTION sync_installation_status_from_etapa();

-- Backfill: alinha os clientes ATUAIS com a etapa da usina deles.
UPDATE leads l SET installation_status = 'pos_venda_concluido', updated_at = now()
  FROM sistemas_clientes s
 WHERE s.lead_id = l.id AND s.ativo AND s.etapa_obra = 'pos_venda'
   AND l.installation_status IS DISTINCT FROM 'pos_venda_concluido';

UPDATE leads l SET installation_status = 'operando', updated_at = now()
  FROM sistemas_clientes s
 WHERE s.lead_id = l.id AND s.ativo AND s.etapa_obra = 'operacao'
   AND l.installation_status IS DISTINCT FROM 'operando';
