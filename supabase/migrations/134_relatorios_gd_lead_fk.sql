-- 134_relatorios_gd_lead_fk.sql
--
-- Revisão final da fatia 3 (envio do relatório da usina pela Eva), 27/09/2026.
-- NÃO mexe na 133 (pode já ter sido aplicada/compartilhada).
--
-- 1) LGPD — apagar o cliente apaga o vínculo: relatorios_gd_gerados.lead_id
--    passa a ser FK para leads(id) ON DELETE SET NULL. Com lead_id nulo, o
--    link público /rg/<token> responde 404 (relatorio-publico.ts).
-- 2) Duplo clique / duas abas: `enviando_desde` marca o envio em andamento, e
--    o índice único parcial deixa só UMA reserva viva por empresa+UC+mês. A
--    aplicação solta reservas com mais de 2 minutos (servidor caiu no meio).

-- (1) FK do cliente. Órfãos (lead já apagado) viram NULL antes de validar.
update relatorios_gd_gerados r
   set lead_id = null
 where r.lead_id is not null
   and not exists (select 1 from leads l where l.id = r.lead_id);

do $$ begin
  alter table relatorios_gd_gerados
    add constraint relatorios_gd_gerados_lead_fk
    foreign key (lead_id) references leads(id) on delete set null
    not valid;
exception when duplicate_object then null; end $$;

alter table relatorios_gd_gerados validate constraint relatorios_gd_gerados_lead_fk;

-- ON DELETE SET NULL precisa achar as linhas pelo lead_id sem varrer a tabela.
create index if not exists relatorios_gd_gerados_lead
  on relatorios_gd_gerados (lead_id);

-- (2) Um envio por vez por empresa + UC + mês.
alter table relatorios_gd_gerados
  add column if not exists enviando_desde timestamptz;

create unique index if not exists relatorios_gd_gerados_um_envio_por_vez
  on relatorios_gd_gerados (company_id, instalacao, referencia)
  where enviando_desde is not null;

NOTIFY pgrst, 'reload schema';
