-- 114: apelido do dono por empresa (multi-tenant).
-- BUG que motivou: os prompts da Eva tinham "Junior" escrito na unha (97 vezes).
-- A assistente do tenant Conquista Solar (Clara) citava o dono da EcoSunPower
-- pros clientes dela. Agora o prompt usa {{rt_apelido}}.
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS rt_apelido text;

-- EcoSunPower: o RT se chama "Junior" (não "Antonio", que é o 1º nome do
-- nome jurídico) — sem isso o fallback mudaria a fala da Eva.
UPDATE empresa_config
   SET rt_apelido = 'Junior'
 WHERE rt_apelido IS NULL
   AND (company_id = '00000000-0000-0000-0000-000000000001' OR company_id IS NULL);

-- Demais tenants ficam NULL de propósito: o código cai no PRIMEIRO NOME do
-- rt_nome da própria empresa (nunca no apelido de outra). Preencher com o
-- nome pelo qual o dono é chamado quando ele informar.
