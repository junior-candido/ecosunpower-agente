-- 142_whatsapp_citar_reagir.sql
--
-- ATENDIMENTO — W2 (28/09/2026): responder CITANDO uma mensagem e REAGIR com
-- emoji, pelo painel, nos dois números (Eva/WABA e o pessoal do dono por QR);
-- e mostrar as citações e reações que o cliente manda.
--
--  1) citando_wamid / citando_texto: a mensagem responde a outra (id do
--     WhatsApp da citada + um pedacinho do texto dela, para mostrar mesmo
--     quando a citada não está no painel);
--  2) reação = uma LINHA própria (tipo 'reacao', texto = emoji, citando_wamid =
--     a mensagem reagida). Uma por pessoa por mensagem: reagir de novo troca;
--     emoji vazio tira;
--  3) a lista do número pessoal (função da 140) ignora reações (não viram
--     "última mensagem").
--
-- Depende da 138 (e da 141, só para as colunas de mídia). Idempotente.

alter table mensagens_whatsapp add column if not exists citando_wamid text;
alter table mensagens_whatsapp add column if not exists citando_texto text;

comment on column mensagens_whatsapp.citando_wamid is
  'W2: id do WhatsApp da mensagem citada (resposta) ou reagida (tipo = reacao).';

-- tipo passa a aceitar 'reacao'.
alter table mensagens_whatsapp drop constraint if exists mensagens_whatsapp_tipo_check;
alter table mensagens_whatsapp add constraint mensagens_whatsapp_tipo_check
  check (tipo in ('texto', 'modelo', 'evento', 'audio', 'imagem', 'video', 'documento', 'reacao'));

create index if not exists mensagens_whatsapp_citando
  on mensagens_whatsapp (company_id, citando_wamid) where citando_wamid is not null;

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
      and m.tipo <> 'reacao'
      and m.texto is not null
    order by m.contato_telefone, m.criado_em desc
  ) u
  order by u.criado_em desc
  limit least(greatest(coalesce(p_limite, 400), 1), 2000);
$$;

revoke all on function conversas_pessoais_recentes(uuid, uuid, int) from public;
revoke all on function conversas_pessoais_recentes(uuid, uuid, int) from anon, authenticated;
grant execute on function conversas_pessoais_recentes(uuid, uuid, int) to service_role;
