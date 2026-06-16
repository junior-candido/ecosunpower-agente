-- migrations/050_empresa_config_link_pagamento.sql
-- Link de pagamento recorrente (EcoSof / Peça C). Interpolado no prompt da vitrine
-- via {{link_pagamento}}. Nullable — quando vazio, a Eva oferece passar o link / agendar.
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS link_pagamento text;
