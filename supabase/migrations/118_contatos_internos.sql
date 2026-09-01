-- 118: gente DE DENTRO no número público da assistente + caixa de recados.
--
-- Junior 01/09/2026: "esse número em que está a Clara, tem muitas pessoas que
-- entram em contato... o pessoal do setor de engenharia enviou para o nosso
-- contato uma indicação de uma auto escola e a IA responde, pedindo informações
-- sobre a auto escola. Sendo que isso é uma conversa interna, ela não precisa
-- intervir. Ela precisa ser identificadora, guardar informações e atender
-- apenas o que lhe cabe."
--
-- POR QUE UMA TABELA NOVA e não uma coluna em dashboard_users: `dashboard_users`
-- responde "quem tem ACESSO ao sistema". Aqui a pergunta é outra: "quem é DE
-- DENTRO". O eletricista precisa entrar na lista sem ganhar login nenhum, e a
-- vendedora que já tem login não precisa ser cadastrada duas vezes pra mesma
-- coisa. Misturar as duas ideias numa tabela só fica ilegível em 3 meses.
--
-- POR QUE LISTA e não só a politica_triagem (migration 116): o texto ajuda a
-- assistente a ENTENDER quem chegou, mas "é da equipe" não pode depender de a
-- IA entender. Número cadastrado é garantia; texto é palpite.

CREATE TABLE IF NOT EXISTS contatos_internos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  telefone     text NOT NULL,          -- só dígitos, com 55 (ex.: 5577981660268)
  setor        text,                   -- engenharia, vendas, administrativo, obra...
  -- o que a assistente faz quando essa pessoa escreve:
  --   'muda'  = não responde nada (só anota)
  --   'anota' = anota e confirma com uma linha curta
  -- ('atende', que aceita consulta de trabalho, entra na próxima fatia)
  modo         text NOT NULL DEFAULT 'anota' CHECK (modo IN ('muda', 'anota')),
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, telefone)
);
CREATE INDEX IF NOT EXISTS idx_contatos_internos_tel
  ON contatos_internos(company_id, telefone) WHERE ativo;

COMMENT ON TABLE contatos_internos IS
  'Pessoas de DENTRO da empresa que escrevem no numero publico da assistente. Nunca viram lead. Diferente de dashboard_users (acesso ao sistema).';

-- Caixa de recados: o que a equipe manda pro número não se perde, mesmo a
-- assistente ficando quieta. É o "guardar informações" que o Junior pediu.
CREATE TABLE IF NOT EXISTS recados_equipe (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contato_id   uuid REFERENCES contatos_internos(id) ON DELETE SET NULL,
  telefone     text NOT NULL,
  nome         text NOT NULL,
  mensagem     text NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  lido_em      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_recados_equipe_empresa
  ON recados_equipe(company_id, criado_em DESC);

COMMENT ON TABLE recados_equipe IS
  'Mensagens da equipe que chegaram no numero da assistente. Aparecem na tela Recados da equipe do dashboard.';

-- Isolamento entre empresas (mesmo padrão da 111).
ALTER TABLE public.contatos_internos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos_internos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.contatos_internos;
CREATE POLICY company_isolation ON public.contatos_internos
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

ALTER TABLE public.recados_equipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recados_equipe FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.recados_equipe;
CREATE POLICY company_isolation ON public.recados_equipe
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- Os 4 números que o Junior passou (Conquista Solar, 01/09/2026). Todos começam
-- em 'anota': a assistente confirma o recebimento e cala a boca. Quem for subir
-- pra 'atende' (consulta de trabalho) é decisão da fatia 2.
INSERT INTO contatos_internos (company_id, nome, telefone, setor, modo)
VALUES
  ('99fd46d7-60fc-49fe-918f-66587ffa3829', 'Lazaro',   '5577981660268', 'engenharia', 'anota'),
  ('99fd46d7-60fc-49fe-918f-66587ffa3829', 'Nathalia', '5577988228385', NULL,         'anota'),
  ('99fd46d7-60fc-49fe-918f-66587ffa3829', 'Angela',   '5577988434891', 'vendas',     'anota'),
  ('99fd46d7-60fc-49fe-918f-66587ffa3829', 'Iuri',     '5577998395933', NULL,         'anota')
ON CONFLICT (company_id, telefone) DO NOTHING;
