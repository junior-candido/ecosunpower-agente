-- Peça 4: histórico de preço de material por loja (comparar onde tá mais barato).
create table if not exists financeiro_materiais_compras (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid references financeiro_lancamentos(id) on delete cascade,
  material text not null,
  material_norm text not null,
  loja text,
  quantidade numeric not null default 1,
  unidade text not null default 'un',
  valor_total numeric not null,
  preco_unitario numeric not null,
  data_evento date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_materiais_norm on financeiro_materiais_compras (material_norm);
