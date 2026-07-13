-- 074_venda_campos.sql — campos da VENDA no lead (Coração da Venda).
-- O momento "vendeu" (botão do dashboard OU comando "fechou" da Eva) grava
-- valor/tipo/kWp aqui. A DATA da venda usa `contract_signed_at` (já existe,
-- migration 008) — é a fonte da linha do tempo (vendas por dia/mês/ano).
-- Fonte ÚNICA: dashboard e Elo leem daqui, sempre alinhados.

alter table leads add column if not exists venda_valor_cents integer;
alter table leads add column if not exists venda_tipo text;
alter table leads add column if not exists venda_kwp numeric;

comment on column leads.venda_valor_cents is 'Valor da venda em centavos de R$ (preenchido no fechamento).';
comment on column leads.venda_tipo is 'Tipo da venda: sistema | servico.';
comment on column leads.venda_kwp is 'Potência do sistema vendido, em kWp (quando sistema).';
