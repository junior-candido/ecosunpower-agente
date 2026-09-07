-- 122_email_modelos_portugues.sql
--
-- Reescreve os 6 modelos da jornada de e-mail em portugues correto.
-- Aplicado a mao na producao da EcoSunPower em 07/09/2026; esta migration
-- existe pra que QUALQUER ambiente novo (e cada empresa clonada) nasca com o
-- texto certo. A semente original (070) ficou com quatro problemas:
--
--   1. Sem acentuacao: "Ola", "voce", "duvidas", "historia", "mes", "ja".
--      744 e-mails sairam assim pros clientes antes de alguem notar.
--   2. Lixo de codificacao: "a-EUR-" no lugar do travessao, que o cliente
--      via literal no corpo do e-mail.
--   3. Assinatura dentro do texto. Ela passou pra moldura (email-moldura.ts),
--      que monta nome + titulo + telefone com link do WhatsApp a partir da
--      config da empresa. Sem isso o e-mail sairia com DUAS assinaturas.
--   4. Link de descadastro dentro do texto, sendo que a moldura ja poe um no
--      rodape: o cliente recebia o link duplicado.
--
-- A trava que impede isso de voltar esta em src/modules/email/portugues.ts,
-- com teste que quebra o build.

update email_modelos set
  assunto_padrao = 'Sua energia solar começa aqui',
  corpo_html = '<p>Olá, {nome}!</p>
<p>Que bom ter você por aqui. Vi que você demonstrou interesse em gerar a sua própria energia, e eu queria começar te dizendo uma coisa simples: <b>o sol nasce de graça todo dia sobre a sua casa</b>. A energia solar só faz esse sol trabalhar pra você.</p>
<p>Gerar a sua própria energia é sair da dependência dos aumentos e das bandeiras da conta de luz. É trocar um gasto que só sobe por um sistema que é seu.</p>
<p>Nos próximos dias eu vou te mostrar, sem enrolação, como isso funciona na prática aí em {cidade}: casos reais e as dúvidas mais comuns.</p>
<p>Se já quiser conversar, é só <b>responder este e-mail</b>. Eu leio pessoalmente.</p>'
where step = 1;

update email_modelos set
  assunto_padrao = 'Um resultado real de quem já gera a própria energia',
  corpo_html = '<p>Olá, {nome}!</p>
<p>Deixa eu te contar uma história de verdade. Um cliente nosso vivia com aquela preocupação no fim do mês: a conta de luz chegando cada vez mais alta, sem previsibilidade nenhuma.</p>
<p>Depois que instalamos o sistema, a virada de chave foi essa: ele parou de se preocupar com a conta. A energia passou a vir do próprio telhado dele. Previsível, estável, sem susto com bandeira vermelha.</p>
<p>O que eu mais gosto de ouvir dos nossos clientes não é sobre economia. É sobre <b>tranquilidade</b>: a sensação de ter resolvido isso de uma vez.</p>
<p>Dá pra fazer o mesmo aí em {cidade}. Quer que eu te explique como ficaria no seu caso? É só responder este e-mail.</p>'
where step = 2;

update email_modelos set
  assunto_padrao = '3 dúvidas que quase todo mundo tem sobre energia solar',
  corpo_html = '<p>Olá, {nome}!</p>
<p>Tem três dúvidas que quase todo mundo me traz antes de decidir. Deixa eu resolver elas rapidinho:</p>
<p><b>1. "E em dia nublado, funciona?"</b><br>Funciona sim. O sistema gera com a luz do dia, não só com sol forte. O dimensionamento já considera o clima da sua região.</p>
<p><b>2. "Dá muito trabalho de manter?"</b><br>Quase nenhum. Uma limpeza de vez em quando e pronto. E o monitoramento fica por nossa conta.</p>
<p><b>3. "E se um dia eu vender o imóvel?"</b><br>O sistema valoriza o imóvel. Energia própria é um baita diferencial na hora de vender ou alugar.</p>
<p>Ficou alguma outra dúvida na cabeça? Me manda respondendo este e-mail que eu te respondo com calma.</p>'
where step = 3;

update email_modelos set
  assunto_padrao = 'Cada mês que passa é uma escolha',
  corpo_html = '<p>Olá, {nome}!</p>
<p>Vou ser bem sincero com você, porque é assim que eu gosto de trabalhar.</p>
<p>Todo mês que passa, você paga a conta de luz pra concessionária, e esse dinheiro vai embora sem voltar. Enquanto isso, o mesmo sol que poderia estar gerando energia pra você continua batendo no seu telhado de graça, sem ser aproveitado.</p>
<p>Não é sobre pressa. É só sobre perceber que <b>esperar também tem um custo</b>, silencioso, todo mês.</p>
<p>Se fizer sentido pra você dar esse passo, eu preparo tudo pensando no seu consumo aí em {cidade}, do jeito certo e no seu tempo. É só me responder.</p>'
where step = 4;

update email_modelos set
  assunto_padrao = 'Uma história que talvez pareça com a sua',
  corpo_html = '<p>Olá, {nome}!</p>
<p>Muita gente que chega até mim começa do mesmo jeito: interessada, mas com um pé atrás. "Será que vale pra mim? Será que é complicado?"</p>
<p>Foi assim com uma cliente que ficou meses só pensando. Pediu um orçamento, sumiu, voltou, pensou mais um pouco. Até que um dia decidiu. Hoje ela me diz que tem um arrependimento só: <b>não ter feito antes</b>.</p>
<p>Eu te conto isso sem nenhuma pressão. Só pra você saber que essa dúvida é normal, e que quando a pessoa entende como funciona, a decisão fica leve.</p>
<p>Se você quiser, eu tiro as suas dúvidas sobre {o_que_pediu} numa boa, no seu ritmo. Responde este e-mail que a gente conversa.</p>'
where step = 5;

update email_modelos set
  assunto_padrao = 'Ainda faz sentido pra você?',
  corpo_html = '<p>Olá, {nome}!</p>
<p>Faz um tempinho que a gente começou essa conversa sobre energia solar, e eu não quero ser aquele chato que fica insistindo. Então esse é o meu último toque por enquanto.</p>
<p>Se agora não é o momento, está tudo bem de verdade. Vou estar por aqui quando você quiser retomar.</p>
<p>Mas se ficou alguma dúvida solta, ou se você só precisava de um empurrãozinho pra tirar do papel, é só <b>me responder este e-mail</b>. Eu adoraria te ajudar a resolver isso de uma vez, aí em {cidade}.</p>
<p>De qualquer forma, obrigado pela sua atenção. O sol continua aí, te esperando. Um dia ele vai estar trabalhando pra você.</p>'
where step = 6;

