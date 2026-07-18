// src/modules/email/dicas-de-ouro.ts
// 💡 Dicas de ouro dos e-mails (Junior 18/07): linguagem SIMPLES, tira-dúvida,
// vencendo as objeções reais que a Eva quebra todo dia (conhecimento/objecoes.md).
// Nada técnico demais, nada de número inventado — só o que é fato consolidado.
// Rotação determinística pelo dia (mesmo dia = mesma dica; testável).

export interface DicaDeOuro {
  titulo: string;
  texto: string;
}

export const DICAS_DE_OURO: DicaDeOuro[] = [
  {
    titulo: 'E quando chove, fico sem luz?',
    texto:
      'Não. Você continua ligado na rede da concessionária: em dia nublado o sistema gera menos e a rede completa. E o que você gerar a mais nos dias de sol vira crédito pra usar depois.',
  },
  {
    titulo: '"Tá caro" é olhar só um lado da conta.',
    texto:
      'A conta de luz você vai pagar pra sempre — e ela só sobe. O sistema solar tem fim: se paga com a própria economia e depois a energia é praticamente de graça por décadas.',
  },
  {
    titulo: 'E se eu mudar de casa?',
    texto:
      'O sistema valoriza o imóvel na venda — o comprador herda a conta de luz baixa. E em muitos casos dá pra levar os equipamentos pra casa nova.',
  },
  {
    titulo: 'Estraga o telhado?',
    texto:
      'Instalação bem feita não fura onde não pode: a fixação é projetada pro seu tipo de telha, com vedação correta. Na prática, os painéis ainda protegem o telhado do sol e da chuva.',
  },
  {
    titulo: 'Painel solar precisa de muita manutenção?',
    texto:
      'Quase nenhuma: uma limpeza de vez em quando e pronto. Não tem peça móvel, não faz barulho — e o desempenho é acompanhado pelo aplicativo.',
  },
  {
    titulo: 'Minha conta veio baixa esse mês. Ainda compensa?',
    texto:
      'Um mês baixo não muda o ano: a média é o que conta. E a tarifa sobe todo ano — quem gera a própria energia sai desse reajuste.',
  },
  {
    titulo: 'Preciso de bateria?',
    texto:
      'Na maioria das casas, não: a rede da concessionária funciona como a sua "bateria" — o excesso do dia vira crédito pra noite. Bateria entra quando você quer energia mesmo em queda da rede.',
  },
  {
    titulo: 'Quanto tempo dura um sistema solar?',
    texto:
      'Os painéis trabalham por 25 anos ou mais — os fabricantes garantem a geração por esse prazo. É um bem durável, como a casa, não um gasto que se repete.',
  },
  {
    titulo: 'Não entendo nada disso. Tem problema?',
    texto:
      'Nenhum. Você não precisa entender de energia — só de conta de luz. A parte técnica, projeto e homologação na concessionária ficam por conta do nosso Responsável Técnico.',
  },
  {
    titulo: 'A conta chega zerada?',
    texto:
      'Chega bem menor: sobra só a taxa mínima da concessionária e a iluminação pública. O grosso do consumo você mesmo gera — e é aí que mora a economia.',
  },
];

/** Dica do dia: rotação determinística (dias corridos desde a época % nº de dicas). */
export function dicaDoDia(agora: Date = new Date()): DicaDeOuro {
  const dias = Math.floor(agora.getTime() / (24 * 60 * 60 * 1000));
  return DICAS_DE_OURO[dias % DICAS_DE_OURO.length]!;
}
