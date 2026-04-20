-- Migration 009: captura de depoimentos (audio/video/texto/screenshot) +
-- rastreamento de confirmacao de review no Google Meu Negocio.

-- -------- LEADS: marca quando review foi confirmada --------
alter table leads add column if not exists review_confirmed_at timestamptz;

create index if not exists idx_leads_review_confirmed
  on leads(review_confirmed_at) where review_confirmed_at is not null;

-- -------- TESTIMONIALS: biblioteca de depoimentos capturados --------
-- Cada depoimento enviado pelo cliente (audio, video, texto livre ou
-- screenshot da review do Google) vira uma linha aqui. Serve tanto pra
-- auditar quanto pra alimentar conteudo do agente de marketing depois.

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  format text not null check (format in ('audio', 'video', 'text', 'screenshot')),
  content text, -- texto bruto. Pra audio/video: transcricao (se disponivel).
  media_url text, -- URL no Supabase Storage quando formato nao e text
  google_posted boolean default false, -- cliente ja postou no GMB?
  usable_for_marketing boolean default true,
  sentiment text check (sentiment is null or sentiment in ('positivo', 'neutro', 'negativo')),
  source_message_id text, -- ID da mensagem original no WhatsApp (pra rastrear)
  notes text, -- observacoes (ex: "destaque pra marketing")
  created_at timestamptz not null default now()
);

create index if not exists idx_testimonials_lead on testimonials(lead_id);
create index if not exists idx_testimonials_usable
  on testimonials(created_at desc)
  where usable_for_marketing = true;

-- Dedup: se mesma mensagem do WhatsApp voltar (retry de queue, replay apos
-- restart), INSERT concorrente com mesmo source_message_id da conflict em
-- vez de criar duplicata. Parcial porque registros manuais nao tem source_id.
create unique index if not exists idx_testimonials_unique_source
  on testimonials(source_message_id)
  where source_message_id is not null;

alter table testimonials enable row level security;
