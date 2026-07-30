-- Migration 096: e-mail no usuário do dashboard — usuários de TENANT
-- (empresa ≠ EcoSun) recebem as boas-vindas por E-MAIL bonito (moldura
-- EcoSunPower) além do zap. Time da casa continua só no zap.
-- Aplicar no SQL Editor ANTES do deploy. Número 096 combinado no grupo.

ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS email text;
