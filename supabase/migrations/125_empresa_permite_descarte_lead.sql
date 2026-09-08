-- 125 — a empresa decide se a assistente pode DESCARTAR lead (08/09/2026)
--
-- Pedido da Conquista Solar: a assistente nunca deve encerrar um atendimento
-- por consumo baixo. Se nao convencer, passa pra equipe — a decisao e de gente,
-- nao do robo. Em Vitoria da Conquista o ticket medio e menor que em Brasilia,
-- e um lead "pequeno" ali fecha.
--
-- TRUE (padrao) = comportamento de hoje, a EcoSunPower nao muda nada.
-- FALSE = a action disqualify_lead vira HANDOFF: o lead segue vivo, a assistente
--         se cala e a equipe assume.
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS permite_descarte_lead boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN empresa_config.permite_descarte_lead IS
  'Se false, a assistente NUNCA descarta lead: o disqualify_lead vira handoff pra equipe. Padrao true (comportamento historico).';

-- ---------------------------------------------------------------------------
-- BUG ANTIGO, achado no mesmo dia: o codigo grava status='descartado', mas esse
-- valor NUNCA existiu no enum lead_status. O Postgres recusava, o codigo so
-- olhava `data` (nunca `error`) e logava um console.warn.
-- Resultado: o disqualify_lead NUNCA funcionou, para nenhuma empresa — a
-- assistente avisava que tinha encerrado e o lead continuava ativo na cadencia.
--
-- ⚠️ ALTER TYPE ... ADD VALUE nao pode ser usado na MESMA transacao em que o
--    valor e gravado. Rode este arquivo ANTES de qualquer UPDATE que use
--    'descartado'.
-- ---------------------------------------------------------------------------
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'descartado';
