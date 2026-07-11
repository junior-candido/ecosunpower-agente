-- 069_elo_email.sql — Espinha do Elo + Maquina de E-mail (Fatia 1)

-- 1) A ESPINHA: linha do tempo unica de eventos
create table if not exists eventos_elo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  lead_id uuid references leads(id) on delete set null,
  cliente_id uuid,
  departamento text,            -- comercial|atendimento|marketing|operacao|relacionamento|financeiro|engenharia
  canal text,                   -- whatsapp|email|sistema|web
  origem text,                  -- modulo/funcao que gerou
  payload jsonb not null default '{}'::jsonb,
  company_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at timestamptz not null default now()
);
create index if not exists idx_eventos_elo_lead on eventos_elo (lead_id, created_at desc);
create index if not exists idx_eventos_elo_tipo on eventos_elo (tipo, created_at desc);
create index if not exists idx_eventos_elo_payload on eventos_elo using gin (payload);

-- 2) Sequencia de e-mail (idempotencia como eva_cadence)
create table if not exists email_sequencia (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  step int not null,
  status text not null default 'pending',   -- pending|sending|sent|cancelled|failed
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  provider_message_id text,
  subject_sent text,
  cancelled_reason text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (lead_id, step)
);
create index if not exists idx_email_seq_due on email_sequencia (scheduled_for)
  where status = 'pending';

-- 3) Modelos aprovados (corpo dos e-mails)
create table if not exists email_modelos (
  id uuid primary key default gen_random_uuid(),
  step int not null unique,
  nome text not null,
  assunto_padrao text not null,   -- fallback se a IA falhar/travar
  corpo_html text not null,       -- com {nome},{cidade},{o_que_pediu},{link_descadastro}
  ativo boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 4) Descadastro (LGPD)
create table if not exists email_descadastro (
  email text primary key,
  lead_id uuid references leads(id) on delete set null,
  motivo text,
  created_at timestamptz not null default now()
);

-- 5) Marcacoes no lead
alter table leads add column if not exists email_opt_out boolean not null default false;
alter table leads add column if not exists email_origem text;  -- import|formulario|eva|manual
