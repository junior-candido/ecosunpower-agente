-- Migration 073: Uso do ecossistema — o Elo sabe QUEM usa O QUÊ e por QUANTO TEMPO.
-- Modelo: 1 linha por (ferramenta, usuario, dia) + contador `batidas`. Cada
-- "batida" (heartbeat de ~1 min que a ferramenta manda enquanto está em uso)
-- soma 1 → batidas ≈ minutos de uso naquele dia. Fatia 1 do painel de uso vivo.
CREATE TABLE IF NOT EXISTS elo_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta text NOT NULL,          -- 'calculadora' | 'dashboard' | ...
  usuario text NOT NULL DEFAULT 'anonimo',   -- nome/identificador da pessoa
  user_id text,                       -- id da pessoa na ferramenta (se houver)
  dia date NOT NULL,
  batidas integer NOT NULL DEFAULT 0 CHECK (batidas >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ferramenta, usuario, dia)
);
CREATE INDEX IF NOT EXISTS idx_elo_uso_ferramenta_dia ON elo_uso (ferramenta, dia DESC);

-- Incremento atômico de uma batida: cria a linha do dia ou soma +1 (sem corrida).
CREATE OR REPLACE FUNCTION elo_uso_bump(p_ferramenta text, p_usuario text, p_user_id text, p_dia date)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO elo_uso (ferramenta, usuario, user_id, dia, batidas, updated_at)
  VALUES (p_ferramenta, COALESCE(NULLIF(p_usuario, ''), 'anonimo'), p_user_id, p_dia, 1, now())
  ON CONFLICT (ferramenta, usuario, dia)
  DO UPDATE SET batidas = elo_uso.batidas + 1, updated_at = now();
$$;

ALTER TABLE elo_uso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON elo_uso FOR ALL USING (true);

COMMENT ON TABLE elo_uso IS 'Uso por pessoa/ferramenta/dia (batidas ~ minutos). O Elo agrega e responde quem usa o que e quanto.';
