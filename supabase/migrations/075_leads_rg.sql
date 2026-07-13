-- 075_leads_rg.sql — RG do cliente pro contrato (a IA lê da CNH e preenche).
-- O CPF já existia (cpf_cnpj). O contrato/procuração também precisam do RG e do
-- órgão emissor — a Sessão Contrato (IA lê CNH) grava aqui, e o gerador usa.
alter table leads add column if not exists rg text;
alter table leads add column if not exists orgao_emissor_rg text;

comment on column leads.rg is 'RG do titular (lido da CNH pela Sessão Contrato).';
comment on column leads.orgao_emissor_rg is 'Órgão emissor do RG (ex.: SSP/DF).';
