-- 084: fatia 1 do "alerta com motivo" (pedido Thiago/Sabion 28/07).
-- O sync passa a GUARDAR o status que o adapter da marca devolve (antes era
-- descartado). O radar usa pra dar NOME ao problema da usina parada:
-- sem comunicação (WiFi) × falha do inversor × parada mas comunicando.
alter table sistemas_clientes add column if not exists status_inversor text;
alter table sistemas_clientes add column if not exists status_inversor_em timestamptz;
comment on column sistemas_clientes.status_inversor is 'ok|offline|falha|desconhecido — último status devolvido pelo adapter da marca';
comment on column sistemas_clientes.status_inversor_em is 'quando o status_inversor foi lido pela última vez';
