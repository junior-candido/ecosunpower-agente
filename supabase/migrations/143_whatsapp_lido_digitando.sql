-- 143_whatsapp_lido_digitando.sql
--
-- ATENDIMENTO — W3 (28/09/2026): os "risquinhos" do WhatsApp no painel e a
-- confirmação de leitura no número pessoal.
--
--  1) mensagens_whatsapp.status passa a aceitar 'entregue' e 'lida' (o que a
--     Meta e a Evolution avisam depois do envio: ✓ enviada → ✓✓ entregue →
--     ✓✓ azul lida). Nunca volta para trás (o servidor confere);
--  2) entregue_em / lida_em: quando cada aviso chegou. Nas mensagens RECEBIDAS
--     do número pessoal, lida_em = quando o painel marcou como lida no WhatsApp;
--  3) whatsapp_numeros_pessoais.marcar_lida_ao_abrir: a OPÇÃO do dono — abrir a
--     conversa no painel marca como lida no celular (✓✓ azul para o cliente).
--     Padrão ligado; desliga na tela "Meu WhatsApp".
--
-- "Digitando…" não fica no banco (é aviso de segundos; fica na memória do servidor).
-- Depende da 138/139. Idempotente.

alter table mensagens_whatsapp drop constraint if exists mensagens_whatsapp_status_check;
alter table mensagens_whatsapp add constraint mensagens_whatsapp_status_check
  check (status in ('enviando', 'enviada', 'entregue', 'lida', 'falhou', 'recebida', 'registrada')) not valid;
alter table mensagens_whatsapp validate constraint mensagens_whatsapp_status_check;

alter table mensagens_whatsapp add column if not exists entregue_em timestamptz;
alter table mensagens_whatsapp add column if not exists lida_em     timestamptz;

comment on column mensagens_whatsapp.lida_em is
  'W3: saída = o cliente leu (✓✓ azul). Entrada (número pessoal) = o painel marcou como lida no WhatsApp.';

-- Recebidas ainda não lidas do número pessoal (marcar como lida ao abrir).
create index if not exists mensagens_whatsapp_nao_lidas
  on mensagens_whatsapp (company_id, visivel_so_para, lead_id, criado_em desc)
  where direcao = 'entrada' and lida_em is null and visivel_so_para is not null;

alter table whatsapp_numeros_pessoais add column if not exists marcar_lida_ao_abrir boolean not null default true;

comment on column whatsapp_numeros_pessoais.marcar_lida_ao_abrir is
  'W3: abrir a conversa no painel marca como lida no WhatsApp (✓✓ azul para o cliente). O dono liga/desliga em Meu WhatsApp.';
