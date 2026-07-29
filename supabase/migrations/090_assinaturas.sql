-- Migration 090: assinaturas — central de mensalidades (Fase 1).
-- Spec: docs/superpowers/specs/2026-07-29-assinaturas-financeiro-design.md
-- Produtos com valor padrão + assinaturas com valor/limite próprios.
-- Cada renovação vira uma linha em cobrancas (089) amarrada por assinatura_id.
-- Aplicar no SQL Editor (projeto prod kupnsoyymulbdzakqlqc) ANTES do deploy.
-- ⚠️ Combinar o número 090 no grupo (append-only).

CREATE TABLE IF NOT EXISTS assinatura_produtos (
  id text PRIMARY KEY,              -- slug legível: 'calculadora', 'monitoramento'
  nome text NOT NULL,
  valor_centavos_padrao integer NOT NULL CHECK (valor_centavos_padrao > 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO assinatura_produtos (id, nome, valor_centavos_padrao) VALUES
  ('calculadora', 'Calculadora Solar', 5700),         -- ~R$ 57 (Junior confirma/edita na tela)
  ('monitoramento', 'Monitoramento de Usinas', 29700) -- R$ 297 (fundador Thiago, 110 usinas)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id text NOT NULL REFERENCES assinatura_produtos(id),
  company_id uuid REFERENCES companies(id),  -- tenant assinante (monitoramento)
  lead_id uuid REFERENCES leads(id),         -- opcional: lead vinculado
  nome text NOT NULL,
  email text,
  telefone text,
  zap_confirmado boolean NOT NULL DEFAULT false,  -- confirmação por código = Fase 2
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  limite integer,                            -- ex: 110 usinas; null = sem limite
  vence_em date NOT NULL,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'travada', 'cancelada')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_vence ON assinaturas(vence_em);
CREATE INDEX IF NOT EXISTS idx_assinaturas_produto ON assinaturas(produto_id);

ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS assinatura_id uuid REFERENCES assinaturas(id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_assinatura ON cobrancas(assinatura_id);

-- Billing é assunto do admin da casa: só o service-role (BYPASS) mexe.
-- RLS ligada SEM política = negado pra qualquer client de tenant.
ALTER TABLE assinatura_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_produtos FORCE ROW LEVEL SECURITY;
ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas FORCE ROW LEVEL SECURITY;
