import { describe, it, expect } from 'vitest';
import { renderSocialProofPage } from '../../src/modules/proposal/social-proof-page.js';
import type { Case } from '../../src/modules/cases-fetcher.js';

const baseCase: Case = {
  slug: 'a',
  titulo: 'Case A',
  cidade: 'Brasília',
  uf: 'DF',
  tipo: 'residencial',
  fotoPrincipal: 'https://x/a.jpg',
  fotos: [],
  featured: true,
};

describe('renderSocialProofPage', () => {
  it('renderiza HTML com 3 cases e selo Google', () => {
    const cases: Case[] = [
      { ...baseCase, slug: 'a', titulo: 'Case A', kwp: 10 },
      { ...baseCase, slug: 'b', titulo: 'Case B', kwp: 12 },
      { ...baseCase, slug: 'c', titulo: 'Case C', kwp: 8 },
    ];
    const html = renderSocialProofPage({
      cases,
      googleNota: '4.9',
      googleQtdAvaliacoes: 47,
    });

    expect(html).toContain('Case A');
    expect(html).toContain('Case B');
    expect(html).toContain('Case C');
    expect(html).toContain('4.9');
    expect(html).toContain('47');
    expect(html).toContain('Linha do Sol');
    expect(html).toContain('Responsável Técnico');
  });

  it('escapa caracteres HTML inseguros no titulo', () => {
    const cases: Case[] = [{ ...baseCase, titulo: '<script>alert(1)</script>' }];
    const html = renderSocialProofPage({ cases, googleNota: '4.9', googleQtdAvaliacoes: 0 });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('lida com cases vazio (mostra so selo Google + mensagem)', () => {
    const html = renderSocialProofPage({ cases: [], googleNota: '4.9', googleQtdAvaliacoes: 47 });
    expect(html).toContain('600+');
    expect(html).toContain('4.9');
  });

  it('inclui depoimento opcional quando passado', () => {
    const html = renderSocialProofPage({
      cases: [baseCase],
      googleNota: '4.9',
      googleQtdAvaliacoes: 47,
      depoimento: { texto: 'Atendimento nota 10', cliente: 'Carlos E.', cidade: 'Brasília-DF' },
    });
    expect(html).toContain('Atendimento nota 10');
    expect(html).toContain('Carlos E.');
  });

  // Pedido do Junior 21/07: "hoje tem apenas 3 fotos num formato retangular
  // (achatado) — quero pelo menos 6, organizadas num formato que veja melhor".
  it('mostra até 6 cases; o 7º fica de fora', () => {
    const cases: Case[] = Array.from({ length: 8 }).map((_, i) => ({
      ...baseCase,
      slug: `c${i}`,
      titulo: `Caso ${i}`,
    }));
    const html = renderSocialProofPage({ cases, googleNota: '4.9', googleQtdAvaliacoes: 0 });
    for (let i = 0; i < 6; i++) expect(html).toContain(`Caso ${i}`);
    expect(html).not.toContain('Caso 6');
    expect(html).not.toContain('Caso 7');
  });

  it('layout em GRADE de 3 colunas com foto grande (não mais a tira achatada de 120px)', () => {
    const cases: Case[] = Array.from({ length: 6 }).map((_, i) => ({
      ...baseCase, slug: `c${i}`, titulo: `Caso ${i}`, kwp: 10 + i,
    }));
    const html = renderSocialProofPage({ cases, googleNota: '4.9', googleQtdAvaliacoes: 0 });
    expect(html).toContain('grid-template-columns:repeat(auto-fit,minmax(200px,1fr))'); // 3 col no A4, 1-2 no celular
    expect(html).toContain('object-fit:cover');
    expect(html).not.toContain('height:120px'); // a tira antiga morreu
    expect(html).toContain('break-inside:avoid'); // card não parte no PDF
  });

  it('cliente de tipo SEM case (rural): rótulo honesto, sem "parecidos com o seu projeto"', () => {
    const cases: Case[] = [{ ...baseCase, tipo: 'residencial' }];
    const html = renderSocialProofPage({ cases, googleNota: '4.9', googleQtdAvaliacoes: 0, tipoCliente: 'rural' });
    expect(html).not.toContain('parecidos com o seu projeto');
    expect(html).toContain('Obras da EcoSunPower');
  });

  it('cliente com case do tipo: rótulo "parecidos" continua', () => {
    const cases: Case[] = [{ ...baseCase, tipo: 'residencial' }];
    const html = renderSocialProofPage({ cases, googleNota: '4.9', googleQtdAvaliacoes: 0, tipoCliente: 'residencial' });
    expect(html).toContain('parecidos com o seu projeto');
  });

  it('com só 3 cases continua bonito (grade se ajusta, nada quebra)', () => {
    const cases: Case[] = Array.from({ length: 3 }).map((_, i) => ({
      ...baseCase, slug: `c${i}`, titulo: `Caso ${i}`,
    }));
    const html = renderSocialProofPage({ cases, googleNota: '4.9', googleQtdAvaliacoes: 0 });
    expect(html).toContain('Caso 2');
    expect(html).not.toContain('undefined');
  });
});
