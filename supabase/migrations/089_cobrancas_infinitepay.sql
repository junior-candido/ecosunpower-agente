-- Migration 089: cobrancas — cobrança via InfinitePay (link de pagamento).
-- Peça 1 do plano de pagamento (sair do Kiwify). Uma linha por cobrança:
-- serviço avulso (ex: Superbom) ou parcela. order_nsu = id do pedido enviado
-- pra InfinitePay (o webhook casa por ele). Preços em CENTAVOS.
--
-- Aplicar no SQL Editor (projeto prod kupnsoyymulbdzakqlqc) ANTES do deploy.
-- ⚠️ Combinar o número 089 no grupo (append-only).

CREATE TABLE IF NOT EXISTS cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  lead_id uuid REFERENCES leads(id),
  descricao text NOT NULL,
  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  provedor text NOT NULL DEFAULT 'infinitepay',
  -- order_nsu: identificador do pedido enviado pra InfinitePay; o webhook casa
  -- por ele (text, sem risco de cast de uuid com lixo externo).
  order_nsu text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  link_url text,
  -- preenchidos quando o pagamento é confirmado (payment_check no webhook):
  invoice_slug text,
  transaction_nsu text,
  metodo text,             -- 'pix' | 'credit_card'
  pago_centavos integer,
  pago_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobrancas_company ON cobrancas(company_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_lead ON cobrancas(lead_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_status ON cobrancas(status);
CREATE INDEX IF NOT EXISTS idx_cobrancas_order_nsu ON cobrancas(order_nsu);

-- RLS (padrão da casa, 079): isola por company_id. As operações reais rodam
-- pelo service-role (webhook sem sessão + billing admin), que tem BYPASS; a
-- política protege se um client de tenant um dia ler a tabela.
ALTER TABLE cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobrancas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON cobrancas;
CREATE POLICY company_isolation ON cobrancas
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
