-- Migration 059: Ordem de Serviço técnica (peça 2b)
-- 1 OS pode estar ligada a uma manutenção (manutencao_id) ou ser avulsa (null).
-- Fotos ficam no Storage (bucket client-attachments); os_fotos guarda a referência.

CREATE TABLE IF NOT EXISTS ordens_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id UUID NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  manutencao_id UUID REFERENCES manutencoes(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('limpeza','revisao_inversor','revisao_eletrica','corretiva','inspecao')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','concluida','cancelada')),
  checklist JSONB,           -- estado preenchido: { chave: valor } (check/medição)
  observacoes TEXT,
  executor UUID,             -- dashboard_users.id (sem FK rígida)
  aberta_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_os_sistema ON ordens_servico (sistema_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_abertas ON ordens_servico (aberta_em) WHERE status = 'aberta';

CREATE TABLE IF NOT EXISTS os_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  item_chave TEXT,           -- a qual item do checklist a foto pertence
  storage_path TEXT NOT NULL,
  legenda TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_os_fotos_os ON os_fotos (os_id);

COMMENT ON TABLE ordens_servico IS
  'Ordem de servico tecnica. manutencao_id null = avulsa. Concluir reusa marcarManutencaoFeita quando ligada.';
