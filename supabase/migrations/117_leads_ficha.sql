-- 117: FICHA do cliente — memória permanente por pessoa.
--
-- Junior 31/08: "ela precisa de memória rápido... o cliente pode entrar em
-- contato novamente e é muito fácil isso acontecer... ela precisa identificar
-- e já saber o que fazer... ter o histórico daquele cliente".
--
-- Diagnóstico: hoje a memória é SÓ as últimas 20 mensagens. O campo `summary`
-- de conversations existe mas NUNCA é gerado (o código lê e regrava igual) —
-- então passou de 20 mensagens, o começo some para sempre. E não havia nada
-- permanente sobre o cliente: o que comprou, quando, qual equipamento.
--
-- A ficha resolve isso: fatos que NÃO expiram, injetados no início de toda
-- conversa. A assistente escreve conforme descobre (ação anotar_ficha).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ficha text;
COMMENT ON COLUMN leads.ficha IS
  'Fatos permanentes do cliente em texto corrido, um por linha com data: o que tem instalado, quando, endereço/local, equipamento, atendimentos anteriores. Injetado no início de toda conversa para a assistente não repetir perguntas.';
