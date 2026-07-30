-- Migration 095: acesso temporário (F2 do Diário) — usuário marcado como
-- temporário é DESATIVADO sozinho quando conclui e não tem mais serviço
-- pendente atribuído. Reabrir um serviço reativa o usuário (e ao concluir de
-- novo, expira de novo). Junior nunca gerencia acesso na mão.
-- Aplicar no SQL Editor ANTES do deploy. Número 095 combinado no grupo.

ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS acesso_temporario boolean NOT NULL DEFAULT false;
