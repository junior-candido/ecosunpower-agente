-- 106: envio automático da Pasta Digital pós-obra (spec docs/superpowers/specs/2026-08-26-pasta-envio-automatico-design.md)
-- Aviso ao Junior (botões Enviar agora / Segurar) quando pasta publicada + medidor trocado.

alter table pastas_cliente
  add column if not exists aviso_envio_em timestamptz,          -- quando o Junior foi avisado pela 1ª vez
  add column if not exists aviso_segurado_ate timestamptz,      -- "Segurar": próximo lembrete
  add column if not exists avisos_enviados integer not null default 0;

alter table leads
  add column if not exists medidor_detectado_auto boolean not null default false;  -- marcado pelo monitoramento (3 dias gerando)

create index if not exists idx_pastas_cliente_envio_auto
  on pastas_cliente (status) where enviado_em is null;
