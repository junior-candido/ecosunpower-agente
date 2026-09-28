-- 139_whatsapp_numero_pessoal.sql
--
-- ATENDIMENTO — Parte 2b (28/09/2026): o WhatsApp Business PESSOAL do dono
-- (Junior, 61 99880-5002) entra no painel pelo QR code da Evolution — o
-- "plano B" enquanto a coexistência oficial da Meta não sai.
--
-- Regras do dono:
--   - só a EcoSun, e só quem conectou vê (conversa pessoal): toda mensagem
--     desse número é gravada em mensagens_whatsapp com visivel_so_para = dono;
--   - TODAS as conversas do número aparecem (amigo pode virar cliente), com o
--     botão "virar lead" para quem ainda não é lead;
--   - mesmo cliente nos dois números = UM lead (telefone com 55, na empresa);
--   - a Eva NUNCA responde nesse número (ele é do dono, não da assistente).
--
-- A instância aqui NÃO pode estar em companies.evolution_instance (lá é número
-- de assistente de tenant, onde a assistente responde). O servidor confere.
--
-- Idempotente: pode rodar de novo sem estragar nada.

create table if not exists whatsapp_numeros_pessoais (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  dono_user_id  uuid not null,                  -- dashboard_users.id: só ele vê as conversas
  dono_nome     text,                           -- como aparece no chat ("👤 Junior")
  instancia     text not null check (instancia ~ '^[a-zA-Z0-9_-]{1,64}$'),
  numero        text,                           -- 55 + DDD + número, quando conectado (informativo)
  ativo         boolean not null default true,  -- false = webhook ignora (nada é gravado)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table whatsapp_numeros_pessoais is
  'Número pessoal (WhatsApp Business) conectado por QR na Evolution. A Eva nunca responde aqui; só o dono vê as conversas. RLS FORCE por company_id.';

-- Uma instância existe uma vez só na plataforma; um número pessoal por pessoa.
create unique index if not exists whatsapp_numeros_pessoais_instancia on whatsapp_numeros_pessoais (instancia);
create unique index if not exists whatsapp_numeros_pessoais_dono on whatsapp_numeros_pessoais (company_id, dono_user_id);

ALTER TABLE public.whatsapp_numeros_pessoais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_numeros_pessoais FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.whatsapp_numeros_pessoais;
CREATE POLICY company_isolation ON public.whatsapp_numeros_pessoais
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
