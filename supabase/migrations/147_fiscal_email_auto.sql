-- 147: NFS-e em produção — envio automático do e-mail da nota ao tomador.
-- Flag POR EMPRESA (multi-tenant), nasce DESLIGADA. Com ela ligada, a NFS-e
-- autorizada em PRODUÇÃO sai por e-mail sozinha (2 PDFs + XML) quando o tomador
-- tem e-mail. O código funciona sem esta migration (lê como "desligado");
-- aplicar ANTES de querer ligar a opção na tela de configuração fiscal.
ALTER TABLE fiscal_config
  ADD COLUMN IF NOT EXISTS email_auto_tomador boolean NOT NULL DEFAULT false;
