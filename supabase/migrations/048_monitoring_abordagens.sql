-- supabase/migrations/048_monitoring_abordagens.sql
-- Eva Monitoramento Evolutivo: diário de abordagens por usina + regras de
-- treino + config de autonomia.
-- Spec: docs/superpowers/specs/2026-06-11-eva-monitoramento-evolutivo-design.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Diário evolutivo: 1 linha = 1 abordagem da Eva a um cliente sobre 1 usina
CREATE TABLE IF NOT EXISTS monitoring_abordagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id uuid NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  alerta_id uuid REFERENCES monitoring_alerts(id) ON DELETE SET NULL,
  tipo text NOT NULL
    CHECK (tipo IN ('parabens', 'depoimento', 'queda', 'offline')),
  etapa int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'proposta'
    CHECK (status IN ('proposta', 'aguardando_aprovacao', 'enviada',
                      'em_conversa', 'lembrete_enviado', 'encerrada')),
  desfecho text
    CHECK (desfecho IN ('resolvido_sozinho', 'limpeza_fechada',
                        'visita_agendada', 'transferido_junior',
                        'sem_resposta', 'descartada_junior')),
  causa_raiz text,
  mensagem_proposta text,
  mensagem_enviada text,
  resposta_resumo text,
  nota_junior text CHECK (nota_junior IN ('boa', 'errou')),
  nota_observacao text,
  reagendada_para timestamptz,
  enviada_em timestamptz,
  lembrete_em timestamptz,
  ultima_resposta_cliente_em timestamptz,
  encerrada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1 abordagem ABERTA por usina por vez (invariante de ritmo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mab_uma_ativa_por_usina
  ON monitoring_abordagens(sistema_id)
  WHERE status <> 'encerrada';
CREATE INDEX IF NOT EXISTS idx_mab_status ON monitoring_abordagens(status);
CREATE INDEX IF NOT EXISTS idx_mab_lead ON monitoring_abordagens(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mab_sistema ON monitoring_abordagens(sistema_id, created_at DESC);

-- 2) Regras de treino (ajustes do Junior viram instruções permanentes)
CREATE TABLE IF NOT EXISTS monitoring_treino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text CHECK (tipo IN ('parabens', 'depoimento', 'queda', 'offline')),
  instrucao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Config de autonomia (singleton, id=1)
CREATE TABLE IF NOT EXISTS monitoring_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  parabens_auto boolean NOT NULL DEFAULT false,
  queda_auto boolean NOT NULL DEFAULT false,
  offline_auto boolean NOT NULL DEFAULT false,
  template_nome text NOT NULL DEFAULT 'eva_monitoramento_v1',
  template_bloqueio_avisado boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO monitoring_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
