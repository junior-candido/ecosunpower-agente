-- 068: RH Trabalhe Conosco — vagas + candidatos + bucket privado de currículos.
-- Junior: combinar o número 068 no grupo antes de aplicar (regra do time).

CREATE TABLE IF NOT EXISTS rh_vagas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      text NOT NULL,
  descricao   text NOT NULL DEFAULT '',
  requisitos  text NOT NULL DEFAULT '',
  cidade      text NOT NULL DEFAULT 'Brasília-DF',
  tipo        text NOT NULL DEFAULT 'CLT',       -- CLT|PJ|Estágio|Temporário
  status      text NOT NULL DEFAULT 'aberta',    -- aberta|fechada
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rh_candidatos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vaga_id          uuid REFERENCES rh_vagas(id) ON DELETE SET NULL,  -- null = banco de talentos
  nome             text NOT NULL,
  telefone         text NOT NULL,
  email            text NOT NULL DEFAULT '',
  curriculo_path   text NOT NULL,                 -- caminho no bucket curriculos
  consentimento_em timestamptz NOT NULL,          -- quando o candidato marcou o aceite (LGPD)
  origem           text NOT NULL DEFAULT 'site',
  status           text NOT NULL DEFAULT 'novo',  -- novo|triado|entrevista|aprovado|reprovado
  nota_ia          numeric,                       -- Entrega 2 (triagem IA)
  resumo_ia        text,                          -- Entrega 2
  alertas_ia       text,                          -- Entrega 2
  historico        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- mudanças de status: {de,para,quem,quando}
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_candidatos_vaga ON rh_candidatos(vaga_id);
CREATE INDEX IF NOT EXISTS idx_rh_candidatos_status ON rh_candidatos(status);

-- Bucket PRIVADO de currículos (acesso só por URL assinada gerada no dashboard).
INSERT INTO storage.buckets (id, name, public)
VALUES ('curriculos', 'curriculos', false)
ON CONFLICT (id) DO NOTHING;

-- Conferir: as duas tabelas existem e o bucket é privado (public=false)
SELECT 'rh_vagas' AS objeto, count(*) AS linhas FROM rh_vagas
UNION ALL
SELECT 'rh_candidatos', count(*) FROM rh_candidatos
UNION ALL
SELECT 'bucket curriculos (0=privado ok)', CASE WHEN public THEN 1 ELSE 0 END FROM storage.buckets WHERE id = 'curriculos';
