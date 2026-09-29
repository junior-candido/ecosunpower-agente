-- Migration 146: cobrança recorrente — assinaturas com dia de vencimento +
-- FATURAS mensais (uma por competência) + baixa no caixa.
-- Código: src/modules/cobranca-recorrente/ · telas em dashboard/assinaturas-views.ts
-- Guia do Junior: docs/cobranca-recorrente.md
--
-- O que muda:
--  1) assinaturas (090) ganha: descrição, CPF/CNPJ, dia de vencimento (1–28),
--     mês de início, observação, forma de cobrança, empresa DONA (quem cobra;
--     padrão = EcoSunPower) e o status 'pausada'. company_id continua sendo o
--     TENANT assinante (igual 090/091) — nulo = cliente avulso.
--     Linhas antigas: dia/início saem do vence_em atual (dia > 28 vira 28).
--  2) faturas_assinatura (NOVA): uma linha por mês de cada assinatura.
--     UNIQUE (assinatura_id, competencia) = o robô nunca cria 2 faturas do
--     mesmo mês, nem com 2 servidores rodando. Valor copiado na criação →
--     mudar o valor da assinatura vale do próximo ciclo em diante.
--     Cada aviso tem sua coluna (reservada ANTES de enviar) = nunca repete.
--  3) financeiro_lancamentos aceita origem 'assinatura' e banco 'infinitepay'
--     (a mensalidade paga entra no caixa como RECEITA) + categoria
--     'mensalidades'.
--  4) RLS: a empresa dona gerencia; o tenant assinante só LÊ o que é dele.
--  5) Pausa por inadimplência: assistente_pausada_em/pausa_automatica/dias_pausa/
--     pausa_adiada_ate na assinatura. Pausar NÃO bloqueia login nem dados.
--     (O app roda pelo service-role; a RLS é a segunda trava.)
--
-- Idempotente (pode rodar de novo). Aplicar no SQL Editor ANTES do deploy.
-- Número 146 combinado (141–144 reservadas por outro trabalho).

-- ---------------------------------------------------------------------------
-- 1) assinaturas: campos novos
-- ---------------------------------------------------------------------------
ALTER TABLE assinaturas
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS documento text,
  ADD COLUMN IF NOT EXISTS dia_vencimento smallint,
  ADD COLUMN IF NOT EXISTS inicio_em date,
  ADD COLUMN IF NOT EXISTS observacao text,
  ADD COLUMN IF NOT EXISTS forma text NOT NULL DEFAULT 'link_infinitepay',
  ADD COLUMN IF NOT EXISTS dona_company_id uuid NOT NULL
    DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now(),
  -- "Se não pagar, a assistente para" (só tenant; a casa nunca):
  ADD COLUMN IF NOT EXISTS pausa_automatica boolean NOT NULL DEFAULT true,   -- false = nunca pausar automaticamente
  ADD COLUMN IF NOT EXISTS dias_pausa smallint NOT NULL DEFAULT 3,            -- pausa em D+3 (último aviso em D+2)
  ADD COLUMN IF NOT EXISTS pausa_adiada_ate date,                             -- "dar mais prazo"
  ADD COLUMN IF NOT EXISTS assistente_pausada_em timestamptz;                 -- pausada desde (nulo = atendendo)

-- Linhas antigas (090): o ciclo sai do vencimento que já estava lá.
UPDATE assinaturas
   SET dia_vencimento = LEAST(EXTRACT(DAY FROM vence_em)::int, 28)
 WHERE dia_vencimento IS NULL;
UPDATE assinaturas
   SET inicio_em = date_trunc('month', vence_em)::date
 WHERE inicio_em IS NULL;

DO $$
DECLARE c record;
BEGIN
  -- status: troca a CHECK antiga (ativa/travada/cancelada) pela com 'pausada'
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'assinaturas'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%status%'
              AND conname <> 'assinaturas_status_146_check'
  LOOP
    EXECUTE format('ALTER TABLE assinaturas DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assinaturas_status_146_check') THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_status_146_check
      CHECK (status IN ('ativa', 'pausada', 'travada', 'cancelada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assinaturas_dia_vencimento_check') THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_dia_vencimento_check
      CHECK (dia_vencimento IS NULL OR dia_vencimento BETWEEN 1 AND 28);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assinaturas_inicio_em_check') THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_inicio_em_check
      CHECK (inicio_em IS NULL OR EXTRACT(DAY FROM inicio_em) = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assinaturas_dias_pausa_check') THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_dias_pausa_check CHECK (dias_pausa BETWEEN 2 AND 30);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assinaturas_forma_check') THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_forma_check
      CHECK (forma IN ('link_infinitepay'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assinaturas_documento_check') THEN
    ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_documento_check
      CHECK (documento IS NULL OR documento ~ '^([0-9]{11}|[0-9]{14})$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assinaturas_company ON assinaturas(company_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_dona_status ON assinaturas(dona_company_id, status);
-- a cada mensagem que chega o robô pergunta "a assistente desta empresa está pausada?"
CREATE INDEX IF NOT EXISTS idx_assinaturas_pausada ON assinaturas(company_id) WHERE assistente_pausada_em IS NOT NULL;

-- Produto genérico pra cliente avulso (ex.: contrato mensal de O&M).
INSERT INTO assinatura_produtos (id, nome, valor_centavos_padrao) VALUES
  ('outro', 'Outro serviço mensal', 10000)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) faturas_assinatura
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faturas_assinatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id uuid NOT NULL REFERENCES assinaturas(id) ON DELETE CASCADE,
  -- TENANT assinante (cópia da assinatura, pra RLS/tela "Minha assinatura").
  -- Nulo = cliente avulso (só a dona enxerga).
  company_id uuid REFERENCES companies(id),
  -- Quem cobra (a casa).
  dona_company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES companies(id),
  competencia date NOT NULL CHECK (EXTRACT(DAY FROM competencia) = 1),
  vence_em date NOT NULL,
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  descricao text NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'paga', 'cancelada')),
  -- link de pagamento (InfinitePay): a cobrança tem o order_nsu único
  cobranca_id uuid REFERENCES cobrancas(id),
  link_url text,
  -- baixa
  pago_em timestamptz,
  pago_centavos integer,
  taxa_centavos integer,                 -- só se a operadora informar (hoje não informa)
  metodo text,                           -- 'pix' | 'credit_card' | 'pix_direto'
  forma_baixa text CHECK (forma_baixa IS NULL OR forma_baixa IN ('link', 'manual')),
  baixado_por text,                      -- quem marcou na mão (Pix direto)
  lancamento_id uuid REFERENCES financeiro_lancamentos(id) ON DELETE SET NULL,
  -- toques da régua (timestamp de quando saiu; reservado ANTES de enviar)
  aviso_fatura_em timestamptz,           -- D−3: fatura com o link
  aviso_vespera_em timestamptz,          -- D−1: vence amanhã
  aviso_venceu_em timestamptz,           -- D+1: venceu ontem
  aviso_ultimo_em timestamptz,           -- D+2: último aviso (+ Junior)
  recibo_em timestamptz,
  valor_alerta_em timestamptz,           -- alerta 'valor não bate' (uma vez só)
  canal_ultimo_aviso text,               -- 'whatsapp' | 'email' | 'junior' | combinações
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faturas_assinatura_competencia_unica UNIQUE (assinatura_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_faturas_assinatura_company ON faturas_assinatura(company_id);
CREATE INDEX IF NOT EXISTS idx_faturas_assinatura_dona_status ON faturas_assinatura(dona_company_id, status, vence_em);
CREATE UNIQUE INDEX IF NOT EXISTS idx_faturas_assinatura_cobranca
  ON faturas_assinatura(cobranca_id) WHERE cobranca_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Caixa: a mensalidade paga vira RECEITA
-- ---------------------------------------------------------------------------
ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_lancamentos_origem_check;
ALTER TABLE financeiro_lancamentos
  ADD CONSTRAINT financeiro_lancamentos_origem_check
  CHECK (origem IN ('zap_midia', 'zap_texto', 'extrato', 'tela', 'conta', 'assinatura'));

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'financeiro_lancamentos'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%banco_conta%'
  LOOP
    EXECUTE format('ALTER TABLE financeiro_lancamentos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE financeiro_lancamentos
  ADD CONSTRAINT financeiro_lancamentos_banco_conta_check
  CHECK (banco_conta IN ('sicoob_cc', 'sicoob_cartao', 'itau_pj', 'itau_pf', 'visa_emp', 'latam',
                         'santander_pj', 'mercado_pago', 'infinitepay', 'dinheiro', 'desconhecido'));

INSERT INTO financeiro_categorias (slug, nome) VALUES
  ('mensalidades', 'Mensalidades (assinaturas)')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) RLS — dona gerencia; tenant assinante só lê o que é dele
-- ---------------------------------------------------------------------------
ALTER TABLE faturas_assinatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturas_assinatura FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dona_gerencia ON faturas_assinatura;
CREATE POLICY dona_gerencia ON faturas_assinatura
  AS PERMISSIVE FOR ALL
  USING (dona_company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (dona_company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

DROP POLICY IF EXISTS assinante_le ON faturas_assinatura;
CREATE POLICY assinante_le ON faturas_assinatura
  AS PERMISSIVE FOR SELECT
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- assinaturas: a política da 090 deixava o tenant ALTERAR a própria assinatura
-- (valor, status) se um dia usasse um client com a sessão dele. Agora: tenant
-- só lê; quem mexe é a dona.
DROP POLICY IF EXISTS company_isolation ON assinaturas;
DROP POLICY IF EXISTS assinante_le ON assinaturas;
CREATE POLICY assinante_le ON assinaturas
  AS PERMISSIVE FOR SELECT
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
DROP POLICY IF EXISTS dona_gerencia ON assinaturas;
CREATE POLICY dona_gerencia ON assinaturas
  AS PERMISSIVE FOR ALL
  USING (dona_company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (dona_company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
