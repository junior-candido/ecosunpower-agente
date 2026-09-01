-- 119: base de conhecimento PRÓPRIA de cada empresa.
--
-- Junior 01/09/2026, sobre a base compartilhada: "por que se eu tiver que mexer
-- no meu para melhorar, lá fica ruim" e "por que toda vez que entrar um cliente
-- vou ter esse problema de um jeito ou de outro... quando tiver mais clientes
-- ficaremos doido".
--
-- Ele está certo. A pasta `conhecimento/` é 100% EcoSunPower — o que está lá
-- não é só técnico, é POSICIONAMENTO ("por que a EcoSunPower trabalha com
-- Solis", "nossa garantia é 12 meses", "atendemos DF e Goiás"). Compartilhar
-- isso obriga a escolher entre dois erros: ou a assistente do cliente cita a
-- EcoSunPower, ou afirma sobre o cliente coisa que talvez não seja verdade.
--
-- Aqui cada empresa passa a ter a SUA. No banco (não em pasta no repo) por três
-- motivos: cliente novo não exige deploy, a própria empresa edita pela tela, e
-- mexer na base de um não encosta na do outro.
--
-- O que é FATO DE EQUIPAMENTO (specs, norma, lei, física) continua na pasta
-- compartilhada — aquilo é verdade pra qualquer empresa do país.

CREATE TABLE IF NOT EXISTS conhecimento_empresa (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- identificador estável do assunto ('produto', 'garantia', 'processo'...)
  chave         text NOT NULL,
  titulo        text NOT NULL,
  conteudo      text NOT NULL DEFAULT '',
  ordem         int  NOT NULL DEFAULT 100,
  ativo         boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chave)
);
CREATE INDEX IF NOT EXISTS idx_conhecimento_empresa
  ON conhecimento_empresa(company_id, ordem) WHERE ativo;

COMMENT ON TABLE conhecimento_empresa IS
  'O que a assistente sabe sobre a PROPRIA empresa: o que vende, marcas, garantia, regiao, processo. Uma base por empresa - mexer na de uma nao encosta na outra.';

ALTER TABLE public.conhecimento_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conhecimento_empresa FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.conhecimento_empresa;
CREATE POLICY company_isolation ON public.conhecimento_empresa
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- Esqueleto que todo cliente novo recebe no cadastro. Conteúdo VAZIO de
-- propósito: assistente sem resposta é melhor que assistente inventando. A tela
-- mostra o que falta preencher.
INSERT INTO conhecimento_empresa (company_id, chave, titulo, conteudo, ordem)
SELECT c.id, v.chave, v.titulo, '', v.ordem
  FROM companies c
  CROSS JOIN (VALUES
    ('produto',   'O que a empresa vende',                       10),
    ('marcas',    'Marcas com que trabalha',                     20),
    ('garantia',  'Garantias que oferece',                       30),
    ('regiao',    'Onde atende',                                 40),
    ('processo',  'Como funciona do orçamento à instalação',     50),
    ('objecoes',  'Dúvidas comuns e como responder',             60),
    ('diferencial', 'Por que fechar com a gente',                70)
  ) AS v(chave, titulo, ordem)
 WHERE c.id = '99fd46d7-60fc-49fe-918f-66587ffa3829'
ON CONFLICT (company_id, chave) DO NOTHING;
