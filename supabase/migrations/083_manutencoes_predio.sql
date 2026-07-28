-- Migration 083: manutencoes_predio — "manutenção do prédio × pedidos do dono"
-- (spec docs/superpowers/specs/2026-07-28-predio-vivo-3d-design.md)
--
-- ⚠️ Nome com sufixo _predio de propósito: `manutencoes` JÁ EXISTE (058 — a
-- manutenção de USINAS: limpeza/revisão). A 1ª versão desta migration colidiu
-- com ela em produção (o CREATE IF NOT EXISTS pulou e a política caiu na
-- tabela errada) — o bloco (A) abaixo RESTAURA a política padrão da 079 nela.
--
-- company_id NULL  = manutenção do PRÉDIO (entrega da EcoSun pra todos)
-- company_id preenchido = PEDIDO DO DONO daquele apto (ex.: demandas SunBright)
-- Aplicar no SQL Editor ANTES do deploy da F1 do Prédio Vivo.

-- (A) restaura a política padrão (079) na tabela de manutenção de USINAS,
-- alterada sem querer pela 1ª versão desta migration em 28/07.
DROP POLICY IF EXISTS company_isolation ON manutencoes;
CREATE POLICY company_isolation ON manutencoes
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- (B) a tabela do Prédio Vivo
CREATE TABLE IF NOT EXISTS manutencoes_predio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  titulo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'pedido' CHECK (status IN ('pedido', 'fazendo', 'entregue')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  entregue_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_manutencoes_predio_company ON manutencoes_predio(company_id);
CREATE INDEX IF NOT EXISTS idx_manutencoes_predio_status ON manutencoes_predio(status);

-- RLS (padrão da casa). Nuance: company_id NULL é manutenção do PRÉDIO —
-- visível a TODOS os aptos (é a graça dela); tenant só ESCREVE no próprio
-- (linha do prédio quem escreve é o serviço EcoSun, service-role com bypass).
ALTER TABLE manutencoes_predio ENABLE ROW LEVEL SECURITY;
ALTER TABLE manutencoes_predio FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON manutencoes_predio;
CREATE POLICY company_isolation ON manutencoes_predio
  AS PERMISSIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
