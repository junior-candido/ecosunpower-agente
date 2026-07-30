-- Migration 097: forma combinada na cobrança (par de links + vigia).
-- O Junior gera o PAR: link Pix (valor líquido) + link cartão (taxa repassada
-- embutida, tabela JUROS_CARTAO_SERVICO conferida na maquininha). O webhook
-- compara COMO o cliente pagou com o combinado e avisa a diferença no zap.
-- Aplicar no SQL Editor ANTES do deploy. Número 097 combinado no grupo.

ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS forma_combinada text;           -- 'pix' | 'cartao-12'…
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS taxa_pct numeric;               -- % embutida no valor
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS valor_liquido_centavos integer; -- o que o Junior quer receber
