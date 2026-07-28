-- 085: régua de atenção POR EMPRESA (pedido Thiago/Sabion 28/07 — "régua alta").
-- Percentual do esperado abaixo do qual a usina acende o AMARELO na análise de
-- geração. NULL = padrão 70. Ex.: Sabion mais folgada = 60.
alter table empresa_config add column if not exists regua_atencao_pct integer;
comment on column empresa_config.regua_atencao_pct is 'corte do aviso de geração baixa em % do esperado (null = 70)';

-- Pra definir a régua da Sabion em 60% (rodar SÓ se o Thiago confirmar):
-- update empresa_config set regua_atencao_pct = 60
--  where company_id = (select id from companies where nome ilike '%sabion%');
