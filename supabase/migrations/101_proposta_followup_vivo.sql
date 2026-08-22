-- 101_proposta_followup_vivo.sql
-- Follow-up sem fim por proposta (spec 2026-08-21 §6). Uma linha por etapa agendada.
CREATE TABLE IF NOT EXISTS public.proposta_followup_vivo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_slug   text NOT NULL REFERENCES public.propostas_publicas(slug) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  etapa           text NOT NULL,            -- D0 | A2H | NA24 | D3 | D5 | D8 | D12 | D20 | D35 | D60 | D90 | M1..Mn | POS_VISITA
  scheduled_for   timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending', -- pending | sending | sent | paused | cancelled | failed
  sent_at         timestamptz,
  message_sent    text,
  cancelled_reason text,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposta_slug, etapa)
);
CREATE INDEX IF NOT EXISTS idx_pfv_due ON public.proposta_followup_vivo (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pfv_lead ON public.proposta_followup_vivo (lead_id);
