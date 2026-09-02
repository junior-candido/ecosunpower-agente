-- 121: menu de entrada por empresa — a primeira pergunta, pra assistente
-- parar de adivinhar.
--
-- Junior 02/09/2026, olhando a Clara errar o alvo no número da Conquista:
-- "esse número não é uma boa para a Clara, ela fica perdida" e "tinha que ser
-- muito ninja para entender tudo isso".
--
-- O diagnóstico é preciso. A política de triagem (migration 116) lista SEIS
-- tipos de pessoa chegando na mesma linha. A assistente lê a mensagem e DEDUZ
-- qual é. Quando a pessoa escreve "oi", não há o que deduzir — ela chuta.
--
-- Perguntar resolve o que prompt nenhum resolve: o cliente declara o assunto e
-- ela executa. Fotovoltaico e aquecimento, em especial, se qualificam por
-- perguntas que não têm nada a ver uma com a outra (conta de luz num, quantos
-- banheiros no outro) — separar isso na porta é o que mais melhora.
--
-- JSONB e não texto: as CHAVES são lidas por código (a triagem decide por elas),
-- então precisam ser estruturadas. NULL = empresa sem menu, comportamento de
-- hoje byte a byte.
--
-- Formato: [{"chave":"fotovoltaico","rotulo":"Energia solar — ..."}, ...]
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS menu_entrada jsonb;

COMMENT ON COLUMN empresa_config.menu_entrada IS
  'Opcoes do menu da primeira mensagem, na ordem. NULL = sem menu (assistente deduz o assunto como antes). Chaves sao estaveis: viram lista clicavel quando a empresa migrar pra API Oficial da Meta.';

-- Conquista Solar: as quatro portas que saíram da política de triagem dela.
-- Os seis casos da triagem viram quatro portas porque "lead da Fortlev" chega
-- pelo fotovoltaico e "cliente que quer ampliar" chega por "já sou cliente" —
-- a assistente separa esses dois depois, na conversa.
UPDATE empresa_config
   SET menu_entrada = '[
     {"chave":"fotovoltaico","rotulo":"Energia solar — quero baixar minha conta de luz"},
     {"chave":"aquecimento","rotulo":"Aquecimento de água — banho ou piscina"},
     {"chave":"cliente","rotulo":"Já sou cliente — dúvida ou manutenção"},
     {"chave":"financeiro","rotulo":"Nota fiscal ou financeiro"}
   ]'::jsonb
 WHERE company_id = '99fd46d7-60fc-49fe-918f-66587ffa3829';

-- Conferência
SELECT nome_fantasia,
       jsonb_array_length(menu_entrada) AS opcoes,
       menu_entrada
  FROM empresa_config
 WHERE company_id = '99fd46d7-60fc-49fe-918f-66587ffa3829';
