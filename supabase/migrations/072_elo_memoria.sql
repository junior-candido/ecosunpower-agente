-- Migration 072: Memória do Elo — o "Pergunte ao Elo" lembra da conversa.
-- Cada pergunta+resposta e guardada POR USUARIO do dashboard; as ultimas sao
-- reinjetadas no contexto pra o Elo responder no fio da conversa (follow-ups).
-- Best-effort no codigo: gravar/ler memoria nunca derruba a resposta.
CREATE TABLE IF NOT EXISTS elo_memoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,                 -- dashboard_users.id (quem perguntou); null = anonimo
  quem text,                    -- nome, so pra facilitar leitura humana
  pergunta text NOT NULL,
  resposta text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_elo_memoria_user ON elo_memoria (user_id, created_at DESC);

ALTER TABLE elo_memoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON elo_memoria FOR ALL USING (true);

COMMENT ON TABLE elo_memoria IS 'Historico do Pergunte ao Elo por usuario (memoria conversacional do cerebro).';
