-- Migration 036: archived_at em leads
-- Permite ocultar lead/cliente sem apagar historico.
-- Combina com o guard de excluirLead (commit 4143681): quando cliente tem
-- proposta ou sistema FV vinculado, Arquivar e a alternativa segura.
-- Reversivel: GET /dashboard/clientes?show=arquivados lista os arquivados
-- e botao Restaurar zera archived_at de volta.

alter table leads add column if not exists archived_at timestamptz;

-- Index parcial: queries default filtram archived_at IS NULL, entao o index
-- so cobre os ativos. Mais eficiente que index completo (90% dos leads ativos).
create index if not exists idx_leads_active
  on leads (updated_at desc)
  where archived_at is null;

comment on column leads.archived_at is
  'Marca o momento em que o lead/cliente foi arquivado. NULL = ativo, listas filtram por esse criterio. Reversivel via /clientes/:id/desarquivar.';
