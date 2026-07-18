import { describe, it, expect } from 'vitest';
import { montarMolduraEmail } from '../src/modules/email/email-moldura.js';

describe('montarMolduraEmail', () => {
  const base = {
    conteudoHtml: '<p>Ola Joao, seja bem-vindo!</p>',
    linkDescadastro: 'https://x.eng.br/e/descadastro?lid=L1',
  };

  it('contem a logo, o conteudo e o link de descadastro', () => {
    const html = montarMolduraEmail(base);
    expect(html).toContain('https://www.ecosunpower.eng.br/logo-ecosunpower-white.png');
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
    expect(html).toContain('Novidades do blog');
    expect(html).toContain('Noticia 1');
    expect(html).toContain('https://x.eng.br/blog/1');
    expect(html).toContain('Noticia 2');
    expect(html).toContain('Noticia 3');
  });

  it('omite a secao de novidades quando noticias esta vazio ou ausente', () => {
    const semCampo = montarMolduraEmail(base);
    const vazio = montarMolduraEmail({ ...base, noticias: [] });
    expect(semCampo).not.toContain('Novidades do blog');
    expect(vazio).not.toContain('Novidades do blog');
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
