-- Migration 022: dados detalhados de cada sistema FV
--
-- Permite cadastrar marca/modelo de painel, inversor, telhado, orientacao,
-- sombreamento — base pro motor de aprendizagem que cruza essas info com
-- geracao real da API e cidade pra calibrar propostas e detectar outliers.
--
-- Todos os campos sao OPCIONAIS (NULL permitido) — sistema funciona sem,
-- mas analises ficam mais ricas quando preenchidos.

ALTER TABLE sistemas_clientes
  ADD COLUMN IF NOT EXISTS painel_marca text,
  ADD COLUMN IF NOT EXISTS painel_modelo text,
  ADD COLUMN IF NOT EXISTS qtd_paineis int CHECK (qtd_paineis IS NULL OR qtd_paineis > 0),
  ADD COLUMN IF NOT EXISTS inversor_modelo text,
  ADD COLUMN IF NOT EXISTS telhado_tipo text CHECK (telhado_tipo IS NULL OR telhado_tipo IN (
    'ceramica', 'fibrocimento', 'laje', 'metalico', 'solo', 'outro'
  )),
  ADD COLUMN IF NOT EXISTS telhado_orientacao text CHECK (telhado_orientacao IS NULL OR telhado_orientacao IN (
    'N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'
  )),
  ADD COLUMN IF NOT EXISTS telhado_inclinacao_graus int CHECK (telhado_inclinacao_graus IS NULL OR (telhado_inclinacao_graus >= 0 AND telhado_inclinacao_graus <= 90)),
  ADD COLUMN IF NOT EXISTS sombreamento_pct int CHECK (sombreamento_pct IS NULL OR (sombreamento_pct >= 0 AND sombreamento_pct <= 100)),
  ADD COLUMN IF NOT EXISTS observacoes text;

-- Index pra agregacao por combinacao de marca (futuro motor de aprendizagem)
CREATE INDEX IF NOT EXISTS idx_sistemas_combinacao
  ON sistemas_clientes(painel_marca, inversor_modelo, cidade)
  WHERE ativo AND painel_marca IS NOT NULL;

COMMENT ON COLUMN sistemas_clientes.painel_marca IS
  'Marca do painel solar (Trina, JA, LONGi, Jinko, Risen, Canadian, DAH, etc).';
COMMENT ON COLUMN sistemas_clientes.painel_modelo IS
  'Modelo especifico do painel (ex: TSM-NEG21C.20-700, JAM72D40-580MB).';
COMMENT ON COLUMN sistemas_clientes.qtd_paineis IS
  'Quantidade de paineis no sistema. Util pra validar potencia (qtd × Wp_paine = kWp_sistema).';
COMMENT ON COLUMN sistemas_clientes.telhado_orientacao IS
  'Orientacao predominante: N, NE, L, SE, S, SO, O, NO. NULL se nao mediu.';
COMMENT ON COLUMN sistemas_clientes.telhado_inclinacao_graus IS
  'Inclinacao do telhado em graus (0-90). NULL se nao mediu.';
COMMENT ON COLUMN sistemas_clientes.sombreamento_pct IS
  'Estimativa de sombreamento: 0=sem sombra, 100=totalmente sombreado.';
COMMENT ON COLUMN sistemas_clientes.observacoes IS
  'Notas livres (manutencoes, situacoes especiais, etc).';
