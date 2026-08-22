-- 103_estado_venda.sql
-- Esteira de estados por lead + versões de proposta (spec 2026-08-21 §3).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estado_venda text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS estado_venda_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_leads_estado_venda ON public.leads (estado_venda) WHERE estado_venda IS NOT NULL;

-- Toda proposta que a Eva monta (sombra ou real) ou que o Junior ajusta vira uma versão.
CREATE TABLE IF NOT EXISTS public.propostas_versoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fundação multi-tenant (079/089): nasce carimbada EcoSun; tenant real
  -- entra quando vendas virar módulo do cardápio dos tenants.
  company_id     uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id        uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  versao         integer NOT NULL,
  autor          text NOT NULL,             -- eva | junior
  sombra         boolean NOT NULL DEFAULT true,
  pedido_texto   text,                      -- o que o Junior escreveu pra gerar esta versão
  params_json    jsonb NOT NULL DEFAULT '{}',
  resultado_json jsonb NOT NULL DEFAULT '{}',
  enviada_em     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, versao)
);
CREATE INDEX IF NOT EXISTS idx_propostas_versoes_lead ON public.propostas_versoes (lead_id, versao DESC);

-- RLS: política padrão da casa (079/089/092/098). O app usa service role
-- (bypassa RLS); a política protege acesso direto com JWT de tenant.
ALTER TABLE public.propostas_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas_versoes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.propostas_versoes;
CREATE POLICY company_isolation ON public.propostas_versoes
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
