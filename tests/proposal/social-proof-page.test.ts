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

  it('limita a 3 cases mesmo se passar mais', () => {
    const cases: Case[] = Array.from({ length: 5 }).map((_, i) => ({
      ...baseCase,
      slug: `c${i}`,
      titulo: `Caso ${i}`,
    }));
    const html = renderSocialProofPage({ cases, googleNota: '4.9', googleQtdAvaliacoes: 0 });
    expect(html).toContain('Caso 0');
    expect(html).toContain('Caso 1');
    expect(html).toContain('Caso 2');
    expect(html).not.toContain('Caso 3');
    expect(html).not.toContain('Caso 4');
  });
});
