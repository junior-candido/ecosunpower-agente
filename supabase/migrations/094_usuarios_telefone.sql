-- Migration 094: telefone (zap) no usuário do dashboard — pro aviso de
-- serviço atribuído chegar no WhatsApp do instalador na hora (F2 do Diário).
-- Sem telefone cadastrado = sem zap (a pessoa vê no dashboard, como antes).
-- Aplicar no SQL Editor ANTES do deploy. Número 094 combinado no grupo.

ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS telefone text;
