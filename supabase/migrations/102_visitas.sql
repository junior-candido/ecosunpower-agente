-- 102_visitas.sql
-- Visita técnica / meet agendada pela Eva ou pelo Junior. Base do toque pós-visita (spec §6).
CREATE TABLE IF NOT EXISTS public.visitas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  phone             text NOT NULL,
  tipo              text NOT NULL DEFAULT 'visita',   -- visita | meet
  inicio            timestamptz NOT NULL,
  fim               timestamptz NOT NULL,
  calendar_event_id text,
  resultado         text,                              -- null | fechou | followup_enviado | cancelada
  pos_visita_em     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visitas_pendentes ON public.visitas (fim) WHERE resultado IS NULL;
