-- 070_email_modelos_seed.sql — Corpo dos 6 e-mails da jornada "nutre e converte lead frio"
-- Autoria mista: este e o MODELO APROVADO pelo Junior (Responsavel Tecnico CREA/CFT).
-- A IA personaliza SO o assunto e a abertura por lead. Variaveis: {nome} {cidade} {o_que_pediu} {link_descadastro}
-- Regra de ouro: NENHUM preco/valor em reais no corpo.
-- Aplicar no SQL Editor do projeto kupnsoyymulbdzakqlqc. Combinar o numero 070 no grupo antes.

insert into email_modelos (step, nome, assunto_padrao, corpo_html) values
(1, 'Boas-vindas',
 'Sua energia solar comeca aqui',
 '<div style="font-family:Arial,sans-serif;font-size:16px;color:#1f2937;line-height:1.6;max-width:560px;margin:auto">
  <p>Ola, {nome}!</p>
  <p>Que bom ter voce por aqui. Vi que voce demonstrou interesse em gerar a sua propria energia, e eu queria comecar te dizendo uma coisa simples: <b>o sol nasce de graca todo dia sobre a sua casa</b> — a energia solar so faz esse sol trabalhar por voce.</p>
  <p>Gerar a sua propria energia e sair da dependencia dos aumentos e das bandeiras da conta de luz. E trocar um gasto que so sobe por um sistema que e seu.</p>
  <p>Nos proximos dias eu vou te mostrar, sem enrolacao, como isso funciona na pratica ai em {cidade} — casos reais, e as duvidas mais comuns.</p>
  <p>Se ja quiser conversar, e so <b>responder este e-mail</b>. Eu leio pessoalmente.</p>
  <p>Um abraco,<br><b>Junior</b><br>Responsavel Tecnico CREA/CFT — EcoSunPower</p>
  <p style="font-size:12px;color:#9ca3af;margin-top:28px">Nao quer mais receber? <a href="{link_descadastro}" style="color:#9ca3af">Descadastrar</a></p>
 </div>'),
(2, 'Prova social',
 'Um resultado real de quem ja gera a propria energia',
 '<div style="font-family:Arial,sans-serif;font-size:16px;color:#1f2937;line-height:1.6;max-width:560px;margin:auto">
  <p>Ola, {nome}!</p>
  <p>Deixa eu te contar uma historia de verdade. Um cliente nosso vivia com aquela preocupacao no fim do mes: a conta de luz chegando cada vez mais alta, sem previsibilidade nenhuma.</p>
  <p>Depois que instalamos o sistema de energia solar, a virada de chave foi essa: ele parou de se preocupar com a conta. A energia passou a vir do proprio telhado dele — previsivel, estavel, sem sustos com bandeira vermelha.</p>
  <p>O que eu mais gosto de ouvir dos nossos clientes nao e sobre a economia — e a <b>tranquilidade</b>. A sensacao de ter resolvido isso de uma vez.</p>
  <p>Da pra fazer o mesmo ai em {cidade}. Quer que eu te explique como ficaria no seu caso? E so responder este e-mail.</p>
  <p>Abraco,<br><b>Junior</b><br>Responsavel Tecnico CREA/CFT — EcoSunPower</p>
  <p style="font-size:12px;color:#9ca3af;margin-top:28px">Nao quer mais receber? <a href="{link_descadastro}" style="color:#9ca3af">Descadastrar</a></p>
 </div>'),
(3, 'Educacao e mitos',
 '3 duvidas que quase todo mundo tem sobre energia solar',
 '<div style="font-family:Arial,sans-serif;font-size:16px;color:#1f2937;line-height:1.6;max-width:560px;margin:auto">
  <p>Ola, {nome}!</p>
  <p>Tem tres duvidas que quase todo mundo me traz antes de decidir. Deixa eu resolver elas rapidinho:</p>
  <p><b>1. "E em dia nublado, funciona?"</b><br>Funciona sim. O sistema gera com a luz do dia, nao so com sol forte. O dimensionamento ja considera o clima da sua regiao.</p>
  <p><b>2. "Da muito trabalho de manter?"</b><br>Quase nenhum. Uma limpeza de vez em quando e so. E a gente cuida do monitoramento pra voce.</p>
  <p><b>3. "E se um dia eu vender o imovel?"</b><br>O sistema valoriza o imovel. Energia propria e um baita diferencial na hora de vender ou alugar.</p>
  <p>Ficou alguma outra duvida na cabeca? Me manda respondendo este e-mail que eu te respondo com calma.</p>
  <p>Abraco,<br><b>Junior</b><br>Responsavel Tecnico CREA/CFT — EcoSunPower</p>
  <p style="font-size:12px;color:#9ca3af;margin-top:28px">Nao quer mais receber? <a href="{link_descadastro}" style="color:#9ca3af">Descadastrar</a></p>
 </div>'),
(4, 'Custo de esperar',
 'Cada mes que passa e uma escolha',
 '<div style="font-family:Arial,sans-serif;font-size:16px;color:#1f2937;line-height:1.6;max-width:560px;margin:auto">
  <p>Ola, {nome}!</p>
  <p>Vou ser bem sincero com voce, porque e assim que eu gosto de trabalhar.</p>
  <p>Todo mes que passa, voce paga a conta de luz pra concessionaria — e esse dinheiro vai embora, sem voltar. Enquanto isso, o mesmo sol que poderia estar gerando energia pra voce continua batendo no seu telhado de graca, sem ser aproveitado.</p>
  <p>Nao e sobre pressa. E so sobre perceber que <b>esperar tambem tem um custo</b> — silencioso, todo mes.</p>
  <p>Se fizer sentido pra voce dar esse passo, eu preparo tudo pensando no seu consumo ai em {cidade}, do jeito certo e no seu tempo. E so me responder.</p>
  <p>Abraco,<br><b>Junior</b><br>Responsavel Tecnico CREA/CFT — EcoSunPower</p>
  <p style="font-size:12px;color:#9ca3af;margin-top:28px">Nao quer mais receber? <a href="{link_descadastro}" style="color:#9ca3af">Descadastrar</a></p>
 </div>'),
(5, 'Historia parecida',
 'Uma historia que talvez pareca com a sua',
 '<div style="font-family:Arial,sans-serif;font-size:16px;color:#1f2937;line-height:1.6;max-width:560px;margin:auto">
  <p>Ola, {nome}!</p>
  <p>Muita gente que chega ate mim comeca do mesmo jeito: interessada, mas com um pe atras. "Sera que vale pra mim? Sera que e complicado?"</p>
  <p>Foi assim com uma cliente que ficou meses so pensando. Ela pediu um orcamento, sumiu, voltou, pensou mais um pouco. Ate que um dia decidiu. Hoje ela me diz que so tem um arrependimento: <b>nao ter feito antes</b>.</p>
  <p>Eu te conto isso sem nenhuma pressao. So pra voce saber que essa duvida e super normal — e que quando a pessoa entende como funciona, a decisao fica leve.</p>
  <p>Se voce quiser, eu tiro suas duvidas sobre {o_que_pediu} numa boa, no seu ritmo. Responde este e-mail que a gente conversa.</p>
  <p>Abraco,<br><b>Junior</b><br>Responsavel Tecnico CREA/CFT — EcoSunPower</p>
  <p style="font-size:12px;color:#9ca3af;margin-top:28px">Nao quer mais receber? <a href="{link_descadastro}" style="color:#9ca3af">Descadastrar</a></p>
 </div>'),
(6, 'Ultimo toque',
 'Ainda faz sentido pra voce?',
 '<div style="font-family:Arial,sans-serif;font-size:16px;color:#1f2937;line-height:1.6;max-width:560px;margin:auto">
  <p>Ola, {nome}!</p>
  <p>Faz um tempinho que a gente comecou essa conversa sobre energia solar, e eu nao quero ser aquele chato que fica insistindo. Entao esse e o meu ultimo toque por enquanto.</p>
  <p>Se agora nao e o momento, esta tudo bem de verdade — vou estar por aqui quando voce quiser retomar.</p>
  <p>Mas se ficou alguma duvida solta, ou se voce so precisava de um empurraozinho pra tirar do papel, e so <b>me responder este e-mail</b>. Eu adoraria te ajudar a resolver isso de uma vez, ai em {cidade}.</p>
  <p>De qualquer forma, obrigado pela sua atencao. O sol continua ai, te esperando. Um dia ele vai estar trabalhando pra voce.</p>
  <p>Um abraco,<br><b>Junior</b><br>Responsavel Tecnico CREA/CFT — EcoSunPower</p>
  <p style="font-size:12px;color:#9ca3af;margin-top:28px">Nao quer mais receber? <a href="{link_descadastro}" style="color:#9ca3af">Descadastrar</a></p>
 </div>')
on conflict (step) do update set
  nome = excluded.nome,
  assunto_padrao = excluded.assunto_padrao,
  corpo_html = excluded.corpo_html,
  updated_at = now();
