// gera preview-email.html com a moldura REAL (uso local, não commitar)
import { montarMolduraEmail } from '../src/modules/email/email-moldura.js';
import { dicaDoDia } from '../src/modules/email/dicas-de-ouro.js';
import { writeFileSync } from 'node:fs';
const html = montarMolduraEmail({
  conteudoHtml: '<p style="margin:0 0 14px;">Olá, <strong>João</strong>! 👋</p><p style="margin:0 0 14px;">A conta de luz não para de subir — e cada reajuste é dinheiro saindo do seu bolso. Quem gera a própria energia sai desse ciclo. Veja o que muda na prática:</p>',
  linkDescadastro: 'https://www.ecosunpower.eng.br/e/descadastro?lid=preview',
  heroImageUrl: 'https://www.ecosunpower.eng.br/cases/01-residencial-quintas-ipes-lago-sul/cover.jpg',
  heroImageAlt: 'Instalação real — Lago Sul',
  kicker: 'Energia solar na prática',
  titulo: 'Vale a pena colocar energia solar? Os números respondem.',
  ctaLabel: 'Quero saber quanto eu economizaria',
  ctaUrl: 'https://www.ecosunpower.eng.br',
  ctaNota: 'Análise sem compromisso, feita pelo nosso Responsável Técnico.',
  dica: dicaDoDia(new Date()),
  noticias: [
    { titulo: 'Nova linha MA-GO antecipada: o que muda para o solar no Brasil', link: 'https://www.ecosunpower.eng.br/blog/linha-transmissao-ma-go-antecipada-impacto-solar-brasil/' },
    { titulo: 'Brasil chega a 50 GW em geração distribuída: o que isso muda pra você', link: 'https://www.ecosunpower.eng.br/blog/caso-pratico-brasil-50-gw-gd-solar-o-que-muda/' },
    { titulo: 'Como escolher o inversor solar ideal: guia completo 2026', link: 'https://www.ecosunpower.eng.br/blog/inversor-solar-ideal-tutorial-2026/' },
  ],
});
writeFileSync('preview-email.html', html);
console.log('OK preview');
