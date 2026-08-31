-- 115: gênero de tratamento + canais de encaminhamento por empresa (multi-tenant).
--
-- (1) O prompt foi escrito no masculino ("o Junior", "pro Junior"). Numa empresa
--     onde quem recebe o lead é "nossa equipe" ou uma mulher, sairia "o Jimena",
--     "pro nossa equipe". rt_genero define artigo e contração.
-- (2) Pedido da Jimena (Conquista Solar, 31/08): quem não quer comprar (dúvida
--     sobre sistema instalado, manutenção de aquecimento/piscina) tem canal
--     próprio. A assistente qualifica ANTES de encaminhar — só manda na hora
--     se a pessoa exigir o número ou for urgência.
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS rt_genero text
  CHECK (rt_genero IN ('m','f'));
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS canais_atendimento jsonb NOT NULL DEFAULT '[]'::jsonb;

-- EcoSunPower: masculino ("o Junior"), sem canal separado (o Junior atende
-- pós-venda pelo mesmo número) → bloco não aparece e o prompt sai idêntico.
UPDATE empresa_config
   SET rt_genero = 'm'
 WHERE rt_genero IS NULL
   AND (company_id = '00000000-0000-0000-0000-000000000001' OR company_id IS NULL);

-- Conquista Solar: lead vai pra "nossa equipe" (vendedoras Angela/Vanessa) e
-- os dois canais que a Jimena passou em 31/08.
UPDATE empresa_config
   SET rt_apelido = 'nossa equipe',
       rt_genero  = 'f',
       rt_titulo  = 'equipe comercial',
       canais_atendimento = '[
         {"assunto":"dúvida ou problema em sistema que a pessoa JÁ TEM (defeito, geração baixa, aplicativo, garantia)","rotulo":"Setor de engenharia","telefone":"77988843303"},
         {"assunto":"manutenção de aquecimento de água, banheiro ou piscina","rotulo":"Financeiro/Serviços","telefone":"77999483357"}
       ]'::jsonb
 WHERE nome_fantasia ILIKE '%conquista%';

-- Demais tenants: rt_genero NULL cai em 'm' no código; canais vazios = fluxo normal.
