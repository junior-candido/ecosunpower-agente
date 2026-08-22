-- 104_tabela_precos.sql
-- Tabela de preços do Junior (spec §4.2): item, modelo, preço unitário, fonte, atualizado_em.
-- Atualizada pelo zap (/tabela ...) ou por print da loja (Belenus/Sol Fácil) lido pela Eva.
CREATE TABLE IF NOT EXISTS public.tabela_precos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fundação multi-tenant (079/089): nasce carimbada EcoSun; tenant real
  -- entra quando vendas virar módulo do cardápio dos tenants.
  company_id           uuid NOT NULL REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  tipo                 text NOT NULL,        -- modulo | micro | estrutura | cabos_protecao
  marca                text NOT NULL,        -- JA | Risen | Hoymiles | GoodWe | Sungrow | (estrutura: ceramico|fibrocimento|metalico|laje) | (cabos: geral)
  modelo               text NOT NULL,        -- "625" | "HMS-2000-4T" | "ceramico" | "geral"
  -- Chave natural SEM caixa: "JA" e "ja" são o MESMO módulo. As colunas *_key
  -- guardam a versão minúscula (o app escreve); marca/modelo guardam como o
  -- Junior digitou, que é o que aparece na lista.
  marca_key            text NOT NULL,
  modelo_key           text NOT NULL,
  potencia_w           integer,              -- módulo: Wp · micro: W de saída (informativo)
  modulos_por_unidade  integer,              -- micro: quantos módulos cada micro aceita (Junior informa, nunca inferido)
  preco_unitario       numeric(12,2) NOT NULL,
  unidade              text NOT NULL,        -- un | modulo | kwp
  fonte                text,                 -- belenus | solfacil | junior
  ativo                boolean NOT NULL DEFAULT true,
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tipo, marca_key, modelo_key)
);
CREATE INDEX IF NOT EXISTS idx_tabela_precos_ativos ON public.tabela_precos (company_id, tipo) WHERE ativo;

-- RLS: política padrão da casa (079/089/092/098). O app usa service role
-- (bypassa RLS); a política protege acesso direto com JWT de tenant.
ALTER TABLE public.tabela_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_precos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.tabela_precos;
CREATE POLICY company_isolation ON public.tabela_precos
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
