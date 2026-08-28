-- Migration 108: tokens de definição de senha (convite por e-mail + "esqueci minha senha")
-- Fim da senha temporária passada no zap: o admin cadastra só o e-mail, o usuário
-- recebe um link único (expira) e cria a própria senha. Ninguém vê senha de ninguém.
-- Guardamos só o HASH (sha256) do token — o token cru viaja uma vez, no e-mail.

CREATE TABLE IF NOT EXISTS public.dashboard_senha_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id     uuid NOT NULL REFERENCES public.dashboard_users(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('convite', 'reset')),
  token_hash  text NOT NULL UNIQUE,
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_senha_tokens_user ON public.dashboard_senha_tokens (user_id);

ALTER TABLE public.dashboard_senha_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_senha_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.dashboard_senha_tokens;
CREATE POLICY company_isolation ON public.dashboard_senha_tokens
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

COMMENT ON TABLE public.dashboard_senha_tokens IS
  'Links de "definir senha" (convite de usuário novo / esqueci minha senha). Lida pelo SERVIÇO nas rotas públicas /dashboard/definir-senha e /dashboard/esqueci-senha.';
