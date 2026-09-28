-- 144_whatsapp_etiquetas_funil.sql
--
-- ATENDIMENTO — W4 (28/09/2026): as ETIQUETAS do WhatsApp Business do número
-- PESSOAL do dono sincronizadas com a ETAPA do funil do lead.
--   - mudar a etapa no painel → troca a etiqueta da conversa no celular;
--   - pôr a etiqueta no celular → muda a etapa do lead no painel;
--   - só para quem JÁ É LEAD (etiqueta em conversa de amigo não mexe em nada);
--   - o mapeamento (etapa ↔ etiqueta) é do dono do número e se configura na
--     tela "Meu WhatsApp" (as etiquetas vêm do próprio WhatsApp dele).
--
-- LGPD: RLS FORCE por company_id (igual à 079/136/138). O servidor lê com a
-- chave de serviço e filtra empresa + número (do dono) explicitamente.
-- Depende da 139. Idempotente.

create table if not exists whatsapp_etiquetas_funil (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  numero_pessoal_id  uuid not null references whatsapp_numeros_pessoais(id) on delete cascade,
  etapa              text not null check (etapa in ('novo', 'qualificando', 'qualificado', 'proposta_enviada', 'negociacao', 'agendado', 'transferido', 'ganho', 'perdido')),
  label_id           text not null check (label_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  label_nome         text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

comment on table whatsapp_etiquetas_funil is
  'W4: etapa do funil ↔ etiqueta do WhatsApp Business do número pessoal (uma etiqueta por etapa, uma etapa por etiqueta). RLS FORCE por company_id.';

create unique index if not exists whatsapp_etiquetas_funil_etapa on whatsapp_etiquetas_funil (numero_pessoal_id, etapa);
create unique index if not exists whatsapp_etiquetas_funil_label on whatsapp_etiquetas_funil (numero_pessoal_id, label_id);
create index if not exists whatsapp_etiquetas_funil_empresa on whatsapp_etiquetas_funil (company_id);

ALTER TABLE public.whatsapp_etiquetas_funil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_etiquetas_funil FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.whatsapp_etiquetas_funil;
CREATE POLICY company_isolation ON public.whatsapp_etiquetas_funil
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
