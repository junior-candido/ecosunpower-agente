-- 101_proposta_followup_vivo.sql
-- Follow-up sem fim por proposta (spec 2026-08-21 §6). Uma linha por etapa agendada.
CREATE TABLE IF NOT EXISTS public.proposta_followup_vivo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fundação multi-tenant (079/089): nasce carimbada EcoSun; tenant real
  -- entra quando o follow-up virar módulo do cardápio dos tenants.
  company_id      uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
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
  -- Re-armar uma etapa (ex.: cliente reabriu conversa e o follow-up recomeça) é
  -- sempre UPSERT (onConflict proposta_slug,etapa) resetando status/scheduled_for/
  -- sent_at/message_sent — NUNCA um INSERT novo, senão duplica a etapa.
  UNIQUE (proposta_slug, etapa)
);
CREATE INDEX IF NOT EXISTS idx_pfv_due ON public.proposta_followup_vivo (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pfv_lead ON public.proposta_followup_vivo (lead_id);

-- RLS: política padrão da casa (079/089/092/098). O app usa service role
-- (bypassa RLS); a política protege acesso direto com JWT de tenant.
ALTER TABLE public.proposta_followup_vivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposta_followup_vivo FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.proposta_followup_vivo;
CREATE POLICY company_isolation ON public.proposta_followup_vivo
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
