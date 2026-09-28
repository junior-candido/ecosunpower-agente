-- 138_mensagens_whatsapp.sql
--
-- ATENDIMENTO — Parte 2 (responder o WhatsApp de dentro do painel, 28/09/2026).
-- Plano: EcoSunPower/Plataforma/2026-09-28-atendimento-whatsapp-plano.md (A3/A4/A12).
--
-- Por que uma tabela nova: `conversations.messages` é a MEMÓRIA CURTA da Eva
-- (cada linha guarda só as últimas 20 mensagens, sem autor nem canal). O que a
-- equipe manda pelo painel não pode se perder, e precisa dizer QUEM mandou e
-- POR QUAL número. Aqui fica, para sempre (até o lead ser apagado):
--   - cada mensagem enviada pelo painel (autor = pessoa logada, canal, modelo,
--     id da Meta, se saiu ou falhou);
--   - os eventos "fulano assumiu" / "devolvido para a Eva" (o mesmo estado do
--     botão "Assumir" que a Eva manda no WhatsApp — leads.eva_active);
--   - (Parte 2b) as mensagens do número pessoal conectado por QR.
--
-- A Eva continua lendo `conversations` como memória. O painel junta as duas.
--
-- ANTI ENVIO DUPLO: cada envio do painel reserva uma `chave_envio` única por
-- empresa ANTES de chamar o WhatsApp. Clique duplo / F5 / duas abas com a
-- mesma chave → o 2º não sai.
--
-- LGPD: RLS FORCE por company_id (igual à 079/136). Apagar o lead apaga as
-- mensagens dele (cascade). `visivel_so_para` esconde conversa pessoal de quem
-- não é o dono do número (Parte 2b).
--
-- Idempotente: pode rodar de novo sem estragar nada.

create table if not exists mensagens_whatsapp (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade, -- sem default: carimbo explícito
  lead_id          uuid references leads(id) on delete cascade,              -- null = contato que ainda não é lead (número pessoal)
  contato_telefone text,                                                      -- 55 + DDD + número (normalizado)
  contato_nome     text,
  direcao          text not null check (direcao in ('entrada', 'saida', 'evento')),
  autor            text not null check (autor in ('cliente', 'eva', 'humano', 'sistema')),
  user_id          uuid,                                                      -- dashboard_users.id de quem mandou/assumiu
  autor_nome       text,
  canal            text check (canal in ('eva_oficial', 'whatsapp_business', 'qr_code')),
  numero           text,                                                      -- phone_number_id (Meta) ou instância (QR)
  tipo             text not null default 'texto'
                     check (tipo in ('texto', 'modelo', 'evento', 'audio', 'imagem', 'video', 'documento')),
  texto            text,
  modelo           text,                                                      -- nome do modelo aprovado (tipo = 'modelo')
  evento           text check (evento in ('assumiu', 'devolveu')),
  origem           text check (origem in ('painel', 'whatsapp', 'celular', 'webhook')),
  wamid            text,                                                      -- id da mensagem no WhatsApp
  chave_envio      text,                                                      -- anti envio duplo (1 por clique)
  status           text not null default 'registrada'
                     check (status in ('enviando', 'enviada', 'falhou', 'recebida', 'registrada')),
  erro             text,
  visivel_so_para  uuid,                                                      -- null = toda a empresa vê
  criado_em        timestamptz not null default now(),
  enviada_em       timestamptz
);

comment on table mensagens_whatsapp is
  'Histórico completo do atendimento: envios do painel (autor/canal), eventos assumiu/devolveu e o número pessoal (QR). RLS FORCE por company_id.';
comment on column mensagens_whatsapp.chave_envio is
  'Uma por clique em Enviar. Única por empresa: o mesmo clique nunca manda duas mensagens.';
comment on column mensagens_whatsapp.visivel_so_para is
  'Conversa do número pessoal: só este usuário vê. null = a empresa toda vê.';

create unique index if not exists mensagens_whatsapp_chave
  on mensagens_whatsapp (company_id, chave_envio) where chave_envio is not null;
create unique index if not exists mensagens_whatsapp_wamid
  on mensagens_whatsapp (company_id, wamid) where wamid is not null;
create index if not exists mensagens_whatsapp_lead
  on mensagens_whatsapp (company_id, lead_id, criado_em) where lead_id is not null;
create index if not exists mensagens_whatsapp_contato
  on mensagens_whatsapp (company_id, contato_telefone, criado_em);

-- ISOLAMENTO POR EMPRESA (mesmo texto da 079 / 136).
ALTER TABLE public.mensagens_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_whatsapp FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.mensagens_whatsapp;
CREATE POLICY company_isolation ON public.mensagens_whatsapp
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- CONVERSA PESSOAL (Parte 2b): linha com visivel_so_para só aparece pra quem
-- é o dono dela. RESTRITIVA = vale JUNTO com o isolamento por empresa. O
-- crachá do operador (JWT) ainda não leva o id da pessoa, então pelo crachá
-- NINGUÉM lê linha pessoal; o servidor lê com a chave de serviço e filtra o
-- dono explicitamente (numero-pessoal.ts / mensagens-whatsapp.ts).
DROP POLICY IF EXISTS so_o_dono_ve_pessoal ON public.mensagens_whatsapp;
CREATE POLICY so_o_dono_ve_pessoal ON public.mensagens_whatsapp
  AS RESTRICTIVE FOR ALL
  USING (visivel_so_para IS NULL OR visivel_so_para::text = coalesce(
      nullif(current_setting('app.user_id', true), ''),
      auth.jwt() ->> 'user_id'))
  WITH CHECK (visivel_so_para IS NULL OR visivel_so_para::text = coalesce(
      nullif(current_setting('app.user_id', true), ''),
      auth.jwt() ->> 'user_id'));
