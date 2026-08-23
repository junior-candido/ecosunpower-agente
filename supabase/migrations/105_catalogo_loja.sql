-- 105_catalogo_loja.sql — catálogo RAW das 3 lojas (Belenus, Sol Fácil, Fortlev),
-- preço vivo. SEPARADO da tabela_precos curada pelo Junior: aqui é referência e
-- comparação de compra; NÃO alimenta o precificador sozinho.
-- ⚠️ Confirmar o número "105" no grupo antes de aplicar (regra CLAUDE.md).
CREATE TABLE IF NOT EXISTS public.catalogo_loja (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fundação multi-tenant (padrão 079/089/104): nasce carimbada EcoSun.
  company_id     uuid NOT NULL REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  fonte          text NOT NULL,            -- belenus | solfacil | fortlev
  categoria      text NOT NULL,            -- modulo|micro|inversor_string|inversor_hibrido|bateria|estrutura|cabo|componente
  sku            text NOT NULL,            -- chave estável DENTRO da loja
  marca          text NOT NULL DEFAULT '',
  modelo         text NOT NULL DEFAULT '',
  descricao      text NOT NULL DEFAULT '',
  potencia_w     integer,                  -- módulo: Wp · inversor/micro: W de saída
  preco_unitario numeric(12,2) NOT NULL,   -- Belenus à vista · Sol Fácil Pix · Fortlev à vista
  preco_cheio    numeric(12,2),
  rs_por_wp      numeric(8,4),             -- só módulo
  estoque        integer,                  -- Belenus tem; demais podem vir null
  datasheet_url  text,                     -- Sol Fácil/Fortlev trazem; Belenus null
  ativo          boolean NOT NULL DEFAULT true,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, fonte, sku)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_loja_ativos
  ON public.catalogo_loja (company_id, categoria, marca) WHERE ativo;

-- RLS: política padrão da casa (079/089/092/098/104). O app usa service role
-- (bypassa RLS); a política protege acesso direto com JWT de tenant.
ALTER TABLE public.catalogo_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_loja FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.catalogo_loja;
CREATE POLICY company_isolation ON public.catalogo_loja
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
