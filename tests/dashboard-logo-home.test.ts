// Garante que a logo do topo da sidebar do dashboard é um link pra a Home.
import { describe, it, expect } from 'vitest';
import { renderLayout } from '../src/modules/dashboard/views.js';

describe('renderLayout — logo clicável volta pra Home', () => {
  it('a logo está envolvida num <a href="/dashboard/home">', () => {
    const html = renderLayout({ active: 'cockpit', title: 'X', body: '<p>oi</p>' } as any);
    // o link pra home deve vir imediatamente antes da imagem da logo
    expect(html).toMatch(/<a href="\/dashboard\/home"[^>]*>\s*<img[^>]*alt="EcoSunPower"/);
  });
});
