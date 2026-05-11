-- 026_add_email_to_leads.sql
-- Adiciona coluna email em leads pra preparar email marketing futuro.
-- Por enquanto Junior so coleta — envio sera implementado em sessao dedicada
-- (provider Resend + templates HTML + dashboard /dashboard/email).

-- 1. Adiciona coluna email NULL (cliente pode nao ter informado)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Indice case-insensitive pra busca rapida + check duplicidade
-- (NAO eh UNIQUE pq alguns membros familia podem usar mesmo email do titular)
CREATE INDEX IF NOT EXISTS idx_leads_email_lower ON leads (LOWER(email)) WHERE email IS NOT NULL;

-- 3. Constraint formato basico de email (RFC 5322 simplificado)
-- Aceita NULL. Quando preenchido, valida que tem @ + dominio com ponto
ALTER TABLE leads
  ADD CONSTRAINT chk_leads_email_format
  CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- 4. Trigger pra normalizar email pra lowercase ao inserir/atualizar
-- (email RFC eh case-insensitive na parte do dominio, e geralmente local-part tambem)
CREATE OR REPLACE FUNCTION normalize_email_lower()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email = LOWER(TRIM(NEW.email));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_email ON leads;
CREATE TRIGGER trg_normalize_email
  BEFORE INSERT OR UPDATE OF email ON leads
  FOR EACH ROW
  EXECUTE FUNCTION normalize_email_lower();

-- 5. Comentario de documentacao
COMMENT ON COLUMN leads.email IS 'Email do cliente (opcional). Normalizado pra lowercase via trigger. Sera usado pra email marketing/comunicacao pos-venda quando feature for ativada.';
