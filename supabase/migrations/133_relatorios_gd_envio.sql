-- 133_relatorios_gd_envio.sql
--
-- ENVIAR O RELATÓRIO AO CLIENTE PELA EVA (Junior 27/09/2026) — fatia 3 dos demonstrativos.
-- Plano: docs/superpowers/plans/2026-09-27-demonstrativos-enviar-relatorio-eva.md
--
-- Cada relatório ENVIADO ganha: o cliente (lead_id), o token do link público
-- /rg/<token>, onde o PDF ficou guardado (bucket client-attachments) e o
-- resultado de cada canal. A rota pública busca SÓ pelo token.
-- RLS: a tabela já tem FORCE RLS por empresa (132) — nada muda.

alter table relatorios_gd_gerados
  add column if not exists lead_id            uuid,
  add column if not exists token              text,
  add column if not exists storage_path       text,
  add column if not exists enviado_em         timestamptz,
  add column if not exists enviado_zap_para   text,
  add column if not exists enviado_email_para text,
  add column if not exists envio              jsonb;

create unique index if not exists relatorios_gd_gerados_token_uniq
  on relatorios_gd_gerados (token);

-- Pasta Digital: "relatórios enviados deste cliente", do mais novo pro mais velho.
create index if not exists relatorios_gd_gerados_lead_enviados
  on relatorios_gd_gerados (lead_id, referencia desc)
  where enviado_em is not null;

-- Tela do cliente: "já enviado em DD/MM" do mês.
create index if not exists relatorios_gd_gerados_envio_mes
  on relatorios_gd_gerados (company_id, instalacao, referencia, enviado_em desc)
  where enviado_em is not null;

NOTIFY pgrst, 'reload schema';
