-- Migration 027: Relaxa constraint de step em eva_cadence pra cadencia infinita.
--
-- Bug: cadencia original (migration 014) tinha step BETWEEN 1 AND 5. Mas agora
-- a cadencia infinita continua agendando step 6, 7, 8, 9, 10, 11... ate o
-- cliente responder ou opt-out. Resultado: auto-agendamento falhava com
-- "violates check constraint eva_cadence_step_check" pra 9 de 10 leads.
--
-- Fix: remove a constraint antiga, adiciona uma nova que so exige step >= 1
-- (sem upper bound). Step pode subir indefinidamente conforme cadencia roda.

alter table eva_cadence drop constraint if exists eva_cadence_step_check;

alter table eva_cadence
  add constraint eva_cadence_step_check check (step >= 1);

comment on column eva_cadence.step is
  '1-10 = toques canonicos da cadencia (0h, 1d, 3d, 7d, 14d, 30d, 60d, 90d, 180d, 365d). 11+ = continuacoes anuais (cadencia infinita ate cliente responder ou opt-out).';
