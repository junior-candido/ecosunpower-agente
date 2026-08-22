-- 102_visitas.sql
-- Visita técnica / meet agendada pela Eva ou pelo Junior. Base do toque pós-visita (spec §6).
CREATE TABLE IF NOT EXISTS public.visitas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fundação multi-tenant (079/089): nasce carimbada EcoSun; tenant real
  -- entra quando visitas virar módulo do cardápio dos tenants.
  company_id        uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
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
CREATE INDEX IF NOT EXISTS idx_visitas_lead ON public.visitas (lead_id);

-- RLS: política padrão da casa (079/089/092/098). O app usa service role
-- (bypassa RLS); a política protege acesso direto com JWT de tenant.
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.visitas;
CREATE POLICY company_isolation ON public.visitas
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
