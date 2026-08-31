-- 116: política de TRIAGEM por empresa (texto livre, escrito pela própria).
--
-- Junior 31/08, olhando a Clara atender: "ela precisa detectar quem é da
-- Fortlev, quem é solar, quem é aquecedor, quem é cliente antigo, quem quer
-- aumentar o sistema". Cada empresa recebe um público diferente no mesmo
-- número — modelar isso em código não escala, então vira texto que a empresa
-- escreve e a assistente lê.
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS politica_triagem text;

-- Conquista Solar (Vitória da Conquista-BA): vende fotovoltaico E aquecimento
-- solar, tem base grande de clientes e usinas instaladas, e recebe lead da
-- parceria Fortlev.
UPDATE empresa_config
   SET descricao_curta = 'empresa de energia solar em Vitória da Conquista-BA, com energia solar fotovoltaica (geração de energia) e aquecimento solar de água (banho e piscina)',
       politica_triagem = 'Cinco tipos de pessoa chegam neste número. Identifique qual é ANTES de escolher as perguntas:

1. LEAD DA FORTLEV — chegou pela parceria com a Fortlev ("vim pela Fortlev", "a Fortlev passou o contato", cita produto Fortlev). Trate como lead novo, mas ANOTE que veio da Fortlev e avise a equipe — essa origem é acompanhada à parte.

2. ENERGIA SOLAR FOTOVOLTAICA — quer gerar energia e baixar a conta de luz. Fala em conta cara, painel, placa, gerar energia, economizar. Qualifique pelo CONSUMO: valor e kWh da conta, tipo de imóvel, cidade.

3. AQUECIMENTO SOLAR DE ÁGUA — quer água quente no banho ou na piscina. Fala em chuveiro, boiler, aquecedor, banho frio, aquecer piscina, gás acabando. ATENÇÃO: aqui NÃO se qualifica por conta de luz. Pergunte quantas pessoas moram, quantos banheiros, se tem banheira ou piscina (e o tamanho), e o que usa hoje (chuveiro elétrico, gás, nada).

4. CLIENTE ANTIGO com dúvida ou manutenção — já comprou. Nunca trate como estranho. Entenda o que houve, conheça a instalação e encaminhe pro canal certo.

5. CLIENTE ANTIGO QUE QUER AUMENTAR — quer ampliar o sistema, um segundo equipamento, bateria, ou levar para outro imóvel. ISSO É VENDA E É SUA: não encaminhe, atenda. É a venda mais fácil que existe, porque a confiança já está construída.

Se a pessoa se encaixar em dois casos (ex.: cliente antigo com defeito E querendo ampliar), atenda a VENDA primeiro e trate o resto depois.'
 WHERE nome_fantasia ILIKE '%conquista%';
