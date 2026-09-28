-- 140_conversas_pessoais_recentes.sql
--
-- ATENDIMENTO — Parte 2b, HISTÓRICO do WhatsApp pessoal (28/09/2026).
-- Com a importação dos últimos 90 dias, o número pessoal do dono passa a ter
-- dezenas de milhares de linhas em mensagens_whatsapp. A lista de Conversas
-- montava os contatos a partir das 1000 mensagens mais novas — quem conversou
-- há mais tempo sumia da lista. Aqui:
--   1) índice para as leituras do número pessoal (dono + contato + data);
--   2) função que devolve UMA linha por contato (a última mensagem), já na
--      ordem da mais recente — o servidor chama com a chave de serviço e
--      filtra empresa + dono explicitamente (mesma regra da 138/139).
--
-- Sem esta migration o painel continua funcionando (cai no modo antigo das
-- 1000 mensagens). Idempotente: pode rodar de novo sem estragar nada.

create index if not exists mensagens_whatsapp_pessoal
  on mensagens_whatsapp (company_id, visivel_so_para, contato_telefone, criado_em desc)
  where visivel_so_para is not null;

create or replace function conversas_pessoais_recentes(p_company uuid, p_dono uuid, p_limite int default 400)
returns setof mensagens_whatsapp
language sql
stable
set search_path = public
as $$
  select u.* from (
    select distinct on (m.contato_telefone) m.*
    from mensagens_whatsapp m
    where m.company_id = p_company
      and m.visivel_so_para = p_dono
      and m.contato_telefone is not null
      and m.direcao <> 'evento'
      and m.texto is not null
    order by m.contato_telefone, m.criado_em desc
  ) u
  order by u.criado_em desc
  limit least(greatest(coalesce(p_limite, 400), 1), 2000);
$$;

comment on function conversas_pessoais_recentes(uuid, uuid, int) is
  'Número pessoal (2b): a última mensagem de cada contato do dono, mais recentes primeiro. Só o servidor (service_role) chama.';

-- Só o servidor: pelo crachá (anon/authenticated) ninguém chama.
revoke all on function conversas_pessoais_recentes(uuid, uuid, int) from public;
revoke all on function conversas_pessoais_recentes(uuid, uuid, int) from anon, authenticated;
grant execute on function conversas_pessoais_recentes(uuid, uuid, int) to service_role;
