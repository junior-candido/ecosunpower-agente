-- Migration 083: manutencoes — "manutenção do prédio × pedidos do dono"
-- (spec docs/superpowers/specs/2026-07-28-predio-vivo-3d-design.md)
-- company_id NULL  = manutenção do PRÉDIO (entrega da EcoSun pra todos)
-- company_id preenchido = PEDIDO DO DONO daquele apto (ex.: demandas SunBright)
-- Aplicar no SQL Editor ANTES do deploy da F1 do Prédio Vivo.

CREATE TABLE IF NOT EXISTS manutencoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  titulo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'pedido' CHECK (status IN ('pedido', 'fazendo', 'entregue')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  entregue_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_manutencoes_company ON manutencoes(company_id);
CREATE INDEX IF NOT EXISTS idx_manutencoes_status ON manutencoes(status);

-- RLS (padrão da casa desde a 079/080). Nuance desta tabela: company_id NULL
-- é manutenção do PRÉDIO — visível a TODOS os aptos (é a graça dela); tenant
-- só ESCREVE no próprio apto (linha do prédio quem escreve é o serviço EcoSun,
-- que roda em service-role e passa por cima do RLS).
alter table manutencoes enable row level security;
alter table manutencoes force row level security;
drop policy if exists company_isolation on manutencoes;
create policy company_isolation on manutencoes
  as permissive for all
  using (company_id is null or company_id = (select coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  with check (company_id = (select coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
