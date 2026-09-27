-- 135_leads_whatsapp_bsuid.sql
--
-- BSUID do WhatsApp — FASE 1 (27/09/2026). Ver docs/whatsapp-bsuid.md.
--
-- A Meta passou a mandar um ID do usuário por empresa (BSUID, 'BR.1234…') em
-- todo webhook. Quem esconde o telefone atrás de @username chega SEM telefone.
-- Antes do fix, esse '' virava lead: TODO MUNDO sem telefone caía no MESMO lead
-- (phone = ''), com conversa compartilhada (LGPD).
--
-- 1) Colunas novas no lead: wa_user_id (BSUID) e wa_username (@username).
-- 2) Um BSUID por empresa (índice único parcial).
-- 3) phone vazio proibido daqui pra frente. Nada é apagado: lead com phone ''
--    (ou só espaços) ganha 'sem-telefone-<id>' — o histórico fica, e o código
--    nunca casa esse valor com telefone de ninguém (tem letra).
--
-- NÃO tira o NOT NULL de phone (isso é fase 2). Idempotente: pode rodar 2x.
-- Aplicar ANTES do deploy do código.

-- (1) Colunas
alter table leads add column if not exists wa_user_id  text;
alter table leads add column if not exists wa_username text;

comment on column leads.wa_user_id  is 'BSUID do WhatsApp (business-scoped user ID da Meta, ex. BR.1234...). Por empresa.';
comment on column leads.wa_username is '@username do WhatsApp, quando o usuário tem.';

-- (2) Um BSUID por empresa
create unique index if not exists leads_company_wa_user_id_key
  on leads (company_id, wa_user_id)
  where wa_user_id is not null;

-- (3) phone vazio proibido. Primeiro a constraint NOT VALID (vale já pras
--     escritas novas), depois a limpeza, depois a validação.
do $$ begin
  alter table leads
    add constraint leads_phone_nao_vazio
    check (btrim(phone) <> '')
    not valid;
exception when duplicate_object then null; end $$;

update leads
   set phone = 'sem-telefone-' || id::text,
       updated_at = now()
 where btrim(phone) = '';

alter table leads validate constraint leads_phone_nao_vazio;

NOTIFY pgrst, 'reload schema';
