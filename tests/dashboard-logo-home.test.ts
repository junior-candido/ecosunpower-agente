// Garante que a logo do topo da sidebar do dashboard é um link pra a ENTRADA.
// TROCA DELIBERADA (renovação do miolo R5, decisão D1 = a — ok do Junior no PR): a logo leva ao Command Center (a entrada de todos).

import { describe, it, expect } from 'vitest';
import { renderLayout } from '../src/modules/dashboard/views.js';

describe('renderLayout — logo clicável volta pra Home', () => {
  it('a logo está envolvida num <a href="/dashboard/command-center">', () => {
    const html = renderLayout({ active: 'cockpit', title: 'X', body: '<p>oi</p>' } as any);
    // o link pra entrada deve vir imediatamente antes da imagem da logo
    expect(html).toMatch(/<a href="\/dashboard\/command-center"[^>]*>\s*<img[^>]*alt="EcoSunPower"/);
  });
});
