import { describe, it, expect } from 'vitest';
import { montarMolduraEmail } from '../src/modules/email/email-moldura.js';

describe('montarMolduraEmail', () => {
  const base = {
    conteudoHtml: '<p>Ola Joao, seja bem-vindo!</p>',
    linkDescadastro: 'https://x.eng.br/e/descadastro?lid=L1',
  };

  it('contem a logo, o conteudo e o link de descadastro', () => {
    const html = montarMolduraEmail(base);
    expect(html).toContain('https://www.ecosunpower.eng.br/logo-ecosun-ecossistema.png');
    expect(html).toContain('<p>Ola Joao, seja bem-vindo!</p>');
    expect(html).toContain(base.linkDescadastro);
    expect(html).toContain('Descadastrar');
  });

  it('renderiza a secao de novidades com ate 3 links quando ha noticias', () => {
    const html = montarMolduraEmail({
      ...base,
      noticias: [
        { titulo: 'Noticia 1', link: 'https://x.eng.br/blog/1' },
        { titulo: 'Noticia 2', link: 'https://x.eng.br/blog/2' },
        { titulo: 'Noticia 3', link: 'https://x.eng.br/blog/3' },
      ],
    });
    expect(html).toContain('Do nosso blog');
    expect(html).toContain('Noticia 1');
    expect(html).toContain('https://x.eng.br/blog/1');
    expect(html).toContain('Noticia 2');
    expect(html).toContain('Noticia 3');
  });

  it('omite a secao de novidades quando noticias esta vazio ou ausente', () => {
    const semCampo = montarMolduraEmail(base);
    const vazio = montarMolduraEmail({ ...base, noticias: [] });
    expect(semCampo).not.toContain('Do nosso blog');
    expect(vazio).not.toContain('Do nosso blog');
  });

  it('escapa HTML perigoso no titulo de uma noticia', () => {
    const html = montarMolduraEmail({
      ...base,
      noticias: [{ titulo: '<script>alert(1)</script>', link: 'https://x.eng.br/blog/malicioso' }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('usa o nome da empresa e a logo customizados quando informados', () => {
    const html = montarMolduraEmail({ ...base, empresa: 'Outra Empresa', logoUrl: 'https://outra.com/logo.png' });
    expect(html).toContain('Outra Empresa');
    expect(html).toContain('https://outra.com/logo.png');
  });
});

describe('dica de ouro', () => {
  it('renderiza o box quando vem e omite quando ausente', async () => {
    const { montarMolduraEmail } = await import('../src/modules/email/email-moldura.js');
    const base = { conteudoHtml: '<p>corpo</p>', linkDescadastro: 'https://x/d' };
    const com = montarMolduraEmail({ ...base, dica: { titulo: 'E quando chove?', texto: 'A rede completa.' } });
    expect(com).toContain('Dica de ouro');
    expect(com).toContain('E quando chove?');
    expect(montarMolduraEmail(base)).not.toContain('Dica de ouro');
  });
  it('dicaDoDia é determinística e cobre o acervo', async () => {
    const { dicaDoDia, DICAS_DE_OURO } = await import('../src/modules/email/dicas-de-ouro.js');
    const d = new Date('2026-07-18T12:00:00Z');
    expect(dicaDoDia(d)).toEqual(dicaDoDia(d));
    expect(DICAS_DE_OURO.length).toBeGreaterThanOrEqual(8);
    const amanha = new Date(d.getTime() + 24*60*60*1000);
    expect(dicaDoDia(amanha)).not.toEqual(dicaDoDia(d));
  });
});

// A ASSINATURA (07/09/2026). Os textos da jornada sao em 1a pessoa ("e assim
// que eu gosto de trabalhar") e terminam pedindo resposta — mas ninguem
// assinava embaixo. O cliente lia uma carta pessoal sem remetente.
describe('assinatura do responsavel', () => {
  const base = { conteudoHtml: '<p>corpo</p>', linkDescadastro: 'https://x/d' };

  it('assina com nome, titulo e link do whatsapp', () => {
    const html = montarMolduraEmail({
      ...base,
      assinatura: { nome: 'Junior', titulo: 'Responsável Técnico CREA/CFT', whatsapp: '5561996978781' },
    });
    expect(html).toContain('Junior');
    expect(html).toContain('Responsável Técnico CREA/CFT');
    expect(html).toContain('https://wa.me/5561996978781');
  });

  it('assina sem whatsapp quando o telefone nao vem', () => {
    const html = montarMolduraEmail({
      ...base,
      assinatura: { nome: 'Maria', titulo: 'Responsável Técnica CREA/CFT' },
    });
    expect(html).toContain('Maria');
    expect(html).toContain('Responsável Técnica CREA/CFT');
    expect(html).not.toContain('wa.me');
  });

  it('nao assina quando nao ha assinatura', () => {
    expect(montarMolduraEmail(base)).not.toContain('wa.me');
  });

  // E-mail de senha/acesso nao e carta pessoal — nao leva assinatura.
  it('nao assina e-mail transacional, mesmo recebendo assinatura', () => {
    const html = montarMolduraEmail({
      ...base,
      transacional: true,
      assinatura: { nome: 'Junior', titulo: 'Responsável Técnico CREA/CFT', whatsapp: '5561996978781' },
    });
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('Responsável Técnico CREA/CFT');
  });

  it('escapa HTML perigoso no nome e no titulo', () => {
    const html = montarMolduraEmail({
      ...base,
      assinatura: { nome: '<script>alert(1)</script>', titulo: '<b>RT</b>' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  // Numero vem de config e pode chegar com mascara. O link do WhatsApp so
  // funciona com digitos.
  it('limpa a mascara do telefone no link do whatsapp', () => {
    const html = montarMolduraEmail({
      ...base,
      assinatura: { nome: 'Junior', titulo: 'RT', whatsapp: '+55 (61) 99697-8781' },
    });
    expect(html).toContain('https://wa.me/5561996978781');
  });
});

// Junior 07/09: "telefone, pode colocar, e com link para zap".
describe('telefone escrito na assinatura', () => {
  const base = { conteudoHtml: '<p>corpo</p>', linkDescadastro: 'https://x/d' };

  it('escreve o numero formatado e ele e o proprio link do whatsapp', () => {
    const html = montarMolduraEmail({
      ...base,
      assinatura: { nome: 'Junior', titulo: 'RT', whatsapp: '5561996978781' },
    });
    expect(html).toContain('(61) 99697-8781');
    expect(html).toContain('https://wa.me/5561996978781');
    expect(html).toContain('WhatsApp');
  });

  it('formata numero fixo de 8 digitos', () => {
    const html = montarMolduraEmail({
      ...base,
      assinatura: { nome: 'Junior', titulo: 'RT', whatsapp: '556133214455' },
    });
    expect(html).toContain('(61) 3321-4455');
  });

  it('formata numero sem o 55 na frente', () => {
    const html = montarMolduraEmail({
      ...base,
      assinatura: { nome: 'Junior', titulo: 'RT', whatsapp: '61996978781' },
    });
    expect(html).toContain('(61) 99697-8781');
  });

  it('numero fora do padrao brasileiro nao quebra: mostra os digitos', () => {
    const html = montarMolduraEmail({
      ...base,
      assinatura: { nome: 'Junior', titulo: 'RT', whatsapp: '1555512345' },
    });
    expect(html).toContain('https://wa.me/1555512345');
    expect(html).toContain('WhatsApp');
  });
});

describe('formatarTelefoneBr', () => {
  it('formata celular, fixo, com e sem DDI, e com mascara', async () => {
    const { formatarTelefoneBr } = await import('../src/modules/email/email-moldura.js');
    expect(formatarTelefoneBr('5561996978781')).toBe('(61) 99697-8781');
    expect(formatarTelefoneBr('+55 (61) 99697-8781')).toBe('(61) 99697-8781');
    expect(formatarTelefoneBr('61996978781')).toBe('(61) 99697-8781');
    expect(formatarTelefoneBr('556133214455')).toBe('(61) 3321-4455');
    expect(formatarTelefoneBr('6133214455')).toBe('(61) 3321-4455');
  });

  it('devolve null quando nao reconhece o formato', async () => {
    const { formatarTelefoneBr } = await import('../src/modules/email/email-moldura.js');
    expect(formatarTelefoneBr('123')).toBeNull();
    expect(formatarTelefoneBr('')).toBeNull();
  });
});

// Junior 07/09: "quando mandar artigos, queria que incentivasse ele a olhar o
// blog" + "o site, os cases de sucesso".
describe('convite pro blog e pros casos de sucesso', () => {
  const base = { conteudoHtml: '<p>corpo</p>', linkDescadastro: 'https://x/d' };
  const comNoticias = { ...base, noticias: [{ titulo: 'N1', link: 'https://x/1' }] };

  it('convida a ver mais artigos e os casos de sucesso', () => {
    const html = montarMolduraEmail(comNoticias);
    expect(html).toContain('Ver todos os artigos');
    expect(html).toContain('Ver casos de sucesso');
    // Caminhos conferidos no site em 07/09/2026.
    expect(html).toContain('https://www.ecosunpower.eng.br/blog');
    expect(html).toContain('https://www.ecosunpower.eng.br/portfolio');
  });

  it('usa o site da empresa quando ela nao e a EcoSunPower', () => {
    const html = montarMolduraEmail({ ...comNoticias, siteUrl: 'https://outra.com.br/' });
    expect(html).toContain('https://outra.com.br/blog');
    expect(html).toContain('https://outra.com.br/portfolio');
    // sem barra dobrada
    expect(html).not.toContain('https://outra.com.br//blog');
  });

  it('nao convida quando nao ha artigos pra mostrar', () => {
    expect(montarMolduraEmail(base)).not.toContain('Ver casos de sucesso');
  });
});
