-- 126: rastreio de QUALQUER e-mail, não só o da sequência de marketing.
--
-- Junior, 09/09/2026, minutos depois de mandar a Pasta Digital da Tatiane:
-- "teria como rastrear para ver se os emails enviados são abertos" e
-- "deve vim no zap cada vez que alguém abrir o email, igual a proposta".
--
-- O DADO JÁ CHEGAVA. O webhook da Resend grava entregue/aberto/clicado/bounce
-- em `eventos_elo` desde 07/09. O problema é que, pra saber DE QUEM é o
-- evento, o webhook procurava o `provider_message_id` só em `email_sequencia`
-- — a tabela da jornada de marketing. E-mail que não é da jornada (a Pasta
-- Digital, uma proposta, qualquer coisa nova) nascia órfão: o evento entrava
-- sem `lead_id`, nenhum alerta disparava e a ficha do cliente não mostrava
-- nada. Foi exatamente o que aconteceu com o e-mail da Tatiane às 20:31.
--
-- Esta tabela é o carimbo que faltava: quem mandou, pra quem, de qual lead.
-- Genérica de propósito — `contexto` diz o que era, e cada coisa nova que
-- passar a mandar e-mail só precisa gravar aqui pra ganhar rastreio de graça.

CREATE TABLE IF NOT EXISTS emails_enviados (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid REFERENCES companies(id) ON DELETE CASCADE,
  lead_id              uuid REFERENCES leads(id) ON DELETE CASCADE,
  -- O id que a Resend devolve no envio. É por ele que o webhook casa o evento.
  provider_message_id  text NOT NULL,
  para                 text NOT NULL,
  assunto              text,
  -- 'pasta_digital' | 'proposta' | 'jornada' | ... — o que era este e-mail.
  contexto             text NOT NULL DEFAULT 'outro',
  enviado_em           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_emails_enviados_mid
  ON emails_enviados(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_emails_enviados_lead
  ON emails_enviados(lead_id, enviado_em DESC);

COMMENT ON TABLE emails_enviados IS
  'Carimbo de todo e-mail que sai: liga o provider_message_id da Resend ao lead. Sem isso o evento de abertura/clique chega orfao e nao vira alerta nem aparece na ficha.';

-- Isolamento por empresa, mesmo padrão da 111.
ALTER TABLE public.emails_enviados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emails_enviados_service_role ON public.emails_enviados;
CREATE POLICY emails_enviados_service_role ON public.emails_enviados
  FOR ALL TO service_role USING (true) WITH CHECK (true);
