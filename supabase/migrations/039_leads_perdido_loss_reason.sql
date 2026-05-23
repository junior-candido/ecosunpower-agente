-- Migration 039: lead perdido com motivo da perda
-- Funil completo no dashboard: alem de Ganhos (installation_status em CLIENTE_STATUSES),
-- tabs Perdidos com motivo categorizado. Diferencial comercial — dashboard
-- mostra "X% perdemos pra concorrente, Y% por nao atender" → gera acao.

-- 1. Adicionar 'perdido' ao enum lead_status (caso ainda nao exista)
alter type lead_status add value if not exists 'perdido';

-- 2. Motivo da perda (categorias fechadas + 'outro' pra livre)
alter table leads add column if not exists loss_reason text;

-- Check constraint defensivo. Valores em snake_case, traducao na view.
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'leads_loss_reason_chk'
  ) then
    alter table leads add constraint leads_loss_reason_chk check (
      loss_reason is null or loss_reason in (
        'nao_atende', 'concorrente', 'sem_orcamento',
        'fora_area', 'sem_interesse', 'outro'
      )
    );
  end if;
end $$;

-- 3. Observacao livre opcional (textarea)
alter table leads add column if not exists loss_notes text;

-- 4. Timestamp pra analytics ("perdidos nos ultimos 30d")
alter table leads add column if not exists lost_at timestamptz;

-- Index parcial pros perdidos (queries de analytics + tab)
create index if not exists idx_leads_lost
  on leads (lost_at desc)
  where status = 'perdido';

comment on column leads.loss_reason is
  'Motivo categorizado da perda do lead. NULL = nao perdido (ou perdido sem motivo).';
comment on column leads.loss_notes is
  'Observacao livre do Junior sobre por que perdeu (opcional).';
comment on column leads.lost_at is
  'Timestamp em que foi marcado como perdido. Pra analytics tipo "X perdidos 30d".';
