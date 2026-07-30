-- Migration 092: Diário de Serviços — registro de campo (visita técnica,
-- instalação, término, manutenção, projeto elétrico...) amarrado no cliente
-- (lead) e opcionalmente na usina. Fotos/vídeos ficam no bucket
-- client-attachments (já existe); aqui só os metadados.
-- Spec: docs/superpowers/specs/2026-07-29-diario-servicos-design.md
-- Aplicar no SQL Editor (prod kupnsoyymulbdzakqlqc) ANTES do deploy.
-- ⚠️ Combinar o número 092 no grupo (append-only).

CREATE TABLE IF NOT EXISTS servico_tipos (
  id text PRIMARY KEY,          -- slug legível
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO servico_tipos (id, nome) VALUES
  ('visita-tecnica', 'Visita técnica'),
  ('instalacao-fv', 'Instalação FV'),
  ('termino-instalacao', 'Término de instalação (entrega)'),
  ('manutencao-limpeza', 'Manutenção / limpeza'),
  ('projeto-eletrico', 'Projeto elétrico'),
  ('padrao-entrada', 'Padrão de entrada'),
  ('reforma-quadro', 'Reforma de quadro'),
  ('laudo-vistoria', 'Laudo / vistoria'),
  ('outro', 'Outro serviço')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  tipo_id text NOT NULL REFERENCES servico_tipos(id),
  lead_id uuid NOT NULL REFERENCES leads(id),          -- o CLIENTE (sempre)
  sistema_id uuid REFERENCES sistemas_clientes(id),    -- usina (opcional)
  observacoes text,
  data_servico date NOT NULL,
  criado_por uuid REFERENCES dashboard_users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicos_lead ON servicos(lead_id);
CREATE INDEX IF NOT EXISTS idx_servicos_sistema ON servicos(sistema_id);
CREATE INDEX IF NOT EXISTS idx_servicos_data ON servicos(data_servico);

CREATE TABLE IF NOT EXISTS servico_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servico_id uuid NOT NULL REFERENCES servicos(id),
  company_id uuid REFERENCES companies(id),
  storage_path text NOT NULL,   -- caminho no bucket client-attachments
  tipo_midia text NOT NULL DEFAULT 'foto' CHECK (tipo_midia IN ('foto', 'video')),
  legenda text,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servico_fotos_servico ON servico_fotos(servico_id);

-- servico_tipos é catálogo global: RLS ligada SEM política nega tenants.
ALTER TABLE servico_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico_tipos FORCE ROW LEVEL SECURITY;

-- servicos e servico_fotos: política padrão da casa (079/089).
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON servicos;
CREATE POLICY company_isolation ON servicos
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

ALTER TABLE servico_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servico_fotos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON servico_fotos;
CREATE POLICY company_isolation ON servico_fotos
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
