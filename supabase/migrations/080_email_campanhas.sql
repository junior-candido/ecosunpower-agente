-- 080 — Campanhas de e-mail avulsas (geradas pela Eva, aprovadas pelo Junior no zap).
--
-- O QUE ESTA MIGRATION FAZ:
-- Cria a tabela `email_campanhas`: cada linha é uma campanha de e-mail avulsa
-- (diferente da jornada de `email_sequencia`, que é a régua automática por lead).
-- Fluxo: Junior manda /campanha no WhatsApp → Eva gera copy (Claude) + imagem
-- (FLUX) → manda preview pro Junior → ao aprovar, dispara pra todos os leads
-- elegíveis. O status caminha: pendente → aprovada → enviada (ou descartada).
--
-- RLS: segue a MESMA regra da 079 (Fase A do multi-tenant). Toda tabela nova
-- a partir da 080 já nasce com company_id + RLS ligado + FORCE + política de
-- isolamento por empresa (guarda de regressão em tests/migrations-tenant-guard).
-- A prova de empresa vem de dois lugares (idêntico à 079):
--   a) `set local app.company_id = '<uuid>'` (conexão direta com role de app)
--   b) claim `company_id` do JWT (caminho PostgREST/Supabase)
-- company_id NUNCA vem do frontend (regra do blueprint).

create table if not exists email_campanhas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default '00000000-0000-0000-0000-000000000001',
  status text not null default 'pendente',  -- pendente | aprovada | enviada | descartada
  tema text,
  assunto text,
  kicker text,
  titulo text,
  corpo_html text,
  cta_label text,
  cta_url text,
  image_url text,
  enviados integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_email_campanhas_status on email_campanhas (status, criado_em desc);
create index if not exists idx_email_campanhas_company on email_campanhas (company_id);

-- RLS: predicado copiado VERBATIM da 079 (company_isolation) — a 079 é a fonte
-- da verdade. app.company_id (conexão direta) OU claim company_id do JWT.
alter table email_campanhas enable row level security;
alter table email_campanhas force row level security;
drop policy if exists company_isolation on email_campanhas;
create policy company_isolation on email_campanhas
  as permissive for all
  using (company_id = (select coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  with check (company_id = (select coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
