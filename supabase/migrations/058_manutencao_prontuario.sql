-- Migration 058: Gestão de Manutenção peça 2a — prontuário + agenda
-- Tabela manutencoes (agenda + histórico) + flags na sistemas_clientes
-- (usina sem API de 1ª classe + cadência editável por usina).
-- Leitura manual de geração reusa geracao_diaria (fetched_source='manual',
-- que já é aceito — a coluna não tem CHECK).

-- 1. Usina: modo de acompanhamento + override de cadência
ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS acompanhamento TEXT NOT NULL DEFAULT 'api'
    CHECK (acompanhamento IN ('api', 'manual'));
ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS manutencao_cadencia JSONB;  -- {"limpeza":3} sobrescreve o padrão global

COMMENT ON COLUMN sistemas_clientes.acompanhamento IS
  'api = sincroniza pelo cron; manual = leitura de geração digitada na mão (sem integração).';

-- 2. manutencoes — 1 linha por manutenção (agendada ou feita) = o prontuário
CREATE TABLE IF NOT EXISTS manutencoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id UUID NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'
  )),
  status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'feita', 'cancelada')),
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('regra', 'alerta', 'manual')),

  data_agendada DATE,
  feita_em DATE,
  feito_por UUID,          -- dashboard_users.id (sem FK rígida: usuário pode sair)
  notas TEXT,
  alerta_id UUID REFERENCES alertas_sistema(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agenda: 1 manutenção ABERTA por (usina, tipo) — evita duplicar agendamento do
-- mesmo tipo na mesma usina (corrida entre auto-agenda e manual).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_manutencao_aberta_por_tipo
  ON manutencoes (sistema_id, tipo) WHERE status = 'agendada';

CREATE INDEX IF NOT EXISTS idx_manutencoes_agenda
  ON manutencoes (data_agendada) WHERE status = 'agendada';
CREATE INDEX IF NOT EXISTS idx_manutencoes_sistema
  ON manutencoes (sistema_id, created_at DESC);

COMMENT ON TABLE manutencoes IS
  'Manutenções por usina: agenda (status agendada) + histórico (status feita). Auto-agenda a próxima ao marcar feita.';
