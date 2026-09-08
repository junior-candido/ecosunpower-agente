-- 124 — telefone_admin por empresa (08/09/2026)
--
-- POR QUE: em 08/09 a Clara (Conquista Solar) fechou uma visita técnica de um
-- lead de Vitória da Conquista-BA e o aviso caiu no WhatsApp do dono da
-- EcoSunPower, junto com o evento no Google Calendar dele. Vazamento entre
-- controladores — ver tenant-admin-guard.ts.
--
-- O `telefone_atendente` NÃO serve pra isso: é a linha PÚBLICA onde a própria
-- assistente atende os clientes (Clara = 5577999610038). Mandar aviso admin pra
-- lá faz o robô mandar mensagem pra ele mesmo. Por isso a coluna nova, exatamente
-- como o tenant-admin-guard.ts já previa.
--
-- NULL = comportamento atual e seguro: nenhum aviso administrativo sai por zap
-- naquele tenant; o lead vive no dashboard e a equipe pega de lá.
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS telefone_admin text;

COMMENT ON COLUMN empresa_config.telefone_admin IS
  'Zap PESSOAL de quem recebe avisos administrativos (lead novo, visita agendada, dossie) desta empresa. NUNCA a linha publica da assistente (telefone_atendente) — o robo mandaria mensagem pra si mesmo. NULL = sem aviso por zap, o lead fica no dashboard.';

-- Agenda própria por empresa. NULL = a empresa não tem agenda configurada e o
-- sistema NÃO cria evento nenhum (em vez de cair na agenda global da EcoSun).
ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS google_calendar_id text;

COMMENT ON COLUMN empresa_config.google_calendar_id IS
  'Agenda Google desta empresa. NULL = nao cria evento (o agendamento fica no dashboard). Exige que a conta OAuth do sistema tenha permissao de escrita nessa agenda.';
