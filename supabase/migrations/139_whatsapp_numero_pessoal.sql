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

-- SÓ O DONO (restritiva, junto com a da empresa): pelo crachá, cada pessoa só
-- enxerga o próprio número pessoal. O servidor usa a chave de serviço + filtro.
DROP POLICY IF EXISTS so_o_dono ON public.whatsapp_numeros_pessoais;
CREATE POLICY so_o_dono ON public.whatsapp_numeros_pessoais
  AS RESTRICTIVE FOR ALL
  USING (dono_user_id::text = coalesce(nullif(current_setting('app.user_id', true), ''), auth.jwt() ->> 'user_id'))
  WITH CHECK (dono_user_id::text = coalesce(nullif(current_setting('app.user_id', true), ''), auth.jwt() ->> 'user_id'));

-- UM NOME, UM DONO: a mesma instância nunca pode ser número pessoal E assistente
-- de empresa (companies.evolution_instance) — senão conversa de cliente de outra
-- empresa cairia na caixa pessoal. Vale nos dois sentidos, sem diferenciar maiúsculas.
create unique index if not exists whatsapp_numeros_pessoais_instancia_lower on whatsapp_numeros_pessoais (lower(instancia));

create or replace function trava_instancia_pessoal() returns trigger language plpgsql as $$
begin
  if exists (select 1 from companies c where lower(c.evolution_instance) = lower(new.instancia)) then
    raise exception 'instancia % ja e de uma assistente (companies.evolution_instance)', new.instancia;
  end if;
  return new;
end $$;
drop trigger if exists trava_instancia_pessoal on whatsapp_numeros_pessoais;
create trigger trava_instancia_pessoal before insert or update of instancia on whatsapp_numeros_pessoais
  for each row execute function trava_instancia_pessoal();

create or replace function trava_instancia_assistente() returns trigger language plpgsql as $$
begin
  if new.evolution_instance is not null and exists (
    select 1 from whatsapp_numeros_pessoais w where lower(w.instancia) = lower(new.evolution_instance)
  ) then
    raise exception 'instancia % ja e um numero pessoal (whatsapp_numeros_pessoais)', new.evolution_instance;
  end if;
  return new;
end $$;
drop trigger if exists trava_instancia_assistente on companies;
create trigger trava_instancia_assistente before insert or update of evolution_instance on companies
  for each row execute function trava_instancia_assistente();
