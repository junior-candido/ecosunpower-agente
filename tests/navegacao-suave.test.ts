// Troca de tela sem clarão (28/09/2026): o Junior ainda via uma piscada ao ir de uma
// tela para outra. Entre um documento e outro o navegador pinta o fundo padrão (branco)
// até o CSS do painel chegar. Agora o <head> já diz, ANTES de qualquer arquivo, a cor
// do fundo e o esquema escuro, e pede a transição suave entre páginas (Chrome/Edge).
import { describe, it, expect } from 'vitest';
import { renderLayout } from '../src/modules/dashboard/views.js';

const cabeca = (h: string) => h.slice(h.indexOf('<head>'), h.indexOf('</head>'));

describe('navegação suave entre telas', () => {
  it('escuro: color-scheme e fundo escuro no <head>, antes do primeiro CSS', () => {
    const c = cabeca(renderLayout({ active: 'home', title: 'X', body: '', dark: true, tailwind: false }));
    const meta = c.indexOf('<meta name="color-scheme" content="dark">');
    const fundo = c.indexOf('html{background:#0A1729}');
    const primeiroCss = c.indexOf('<link rel="stylesheet"');
    expect(meta).toBeGreaterThan(-1);
    expect(fundo).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(primeiroCss);
    expect(fundo).toBeLessThan(primeiroCss);
  });

  it('transição suave entre páginas do mesmo site (claro e escuro)', () => {
    for (const dark of [true, false]) {
      const c = cabeca(renderLayout({ active: 'home', title: 'X', body: '', dark }));
      expect(c).toContain('@view-transition{navigation:auto}');
    }
  });

  it('claro: não força fundo escuro', () => {
    const c = cabeca(renderLayout({ active: 'home', title: 'X', body: '', dark: false }));
    expect(c).not.toContain('html{background:#0A1729}');
    expect(c).not.toContain('content="dark"');
  });
});
