-- 141_whatsapp_midia.sql
--
-- ATENDIMENTO — W1 (28/09/2026): MÍDIA no WhatsApp pelo painel (foto,
-- PDF/documento, áudio e vídeo curto), nos dois números (Eva/WABA e o
-- pessoal do dono por QR). Antes só havia a transcrição/leitura por IA; a
-- partir de agora o ARQUIVO fica guardado e ligado à mensagem.
--
--  1) mensagens_whatsapp ganha as colunas do arquivo (caminho no bucket, tipo,
--     nome, tamanho) e a transcrição do áudio;
--  2) o caminho SEMPRE começa pela empresa da linha (trava no banco: arquivo de
--     uma empresa nunca fica ligado a mensagem de outra);
--  3) bucket PRIVADO `whatsapp-midia` (limite 16 MB, só os tipos permitidos).
--     Sem política de acesso para anon/authenticated em storage.objects: só o
--     servidor (service_role) lê/grava; a tela recebe URL assinada de 2 min
--     DEPOIS de o servidor conferir quem pode ver a conversa (LGPD).
--
-- Sem esta migration o painel continua funcionando (texto como antes); enviar
-- arquivo avisa "não consegui guardar o arquivo". Idempotente.

alter table mensagens_whatsapp add column if not exists midia_caminho text;
alter table mensagens_whatsapp add column if not exists midia_mime    text;
alter table mensagens_whatsapp add column if not exists midia_nome    text;
alter table mensagens_whatsapp add column if not exists midia_bytes   integer;
alter table mensagens_whatsapp add column if not exists transcricao   text;

comment on column mensagens_whatsapp.midia_caminho is
  'W1: arquivo no bucket privado whatsapp-midia (<company_id>/<ano>/<mes>/<uuid>.<ext>). Exibido só por URL assinada curta, depois de o servidor conferir quem vê.';
comment on column mensagens_whatsapp.transcricao is
  'W1: áudio — o que a IA entendeu (fica embaixo do player no painel).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensagens_whatsapp_midia_da_empresa') then
    alter table mensagens_whatsapp add constraint mensagens_whatsapp_midia_da_empresa
      check (midia_caminho is null or (midia_caminho like company_id::text || '/%' and position('..' in midia_caminho) = 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mensagens_whatsapp_midia_bytes') then
    alter table mensagens_whatsapp add constraint mensagens_whatsapp_midia_bytes
      check (midia_bytes is null or (midia_bytes > 0 and midia_bytes <= 16777216));
  end if;
end $$;

-- Bucket privado (16 MB; só foto, áudio, vídeo e documentos da lista branca).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-midia', 'whatsapp-midia', false, 16777216,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/3gpp',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword', 'application/vnd.ms-excel',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
