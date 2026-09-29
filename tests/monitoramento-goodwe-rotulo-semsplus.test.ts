// GoodWe migrou pro SEMS+ (#348): a tela de importar não pode mais falar em
// "SEMS Portal" (o portal antigo foi desligado em 23/09).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderImportarSitesPage } from '../src/modules/dashboard/views.js';

describe('GoodWe — rótulo SEMS+', () => {
  it('a tela de importar diz SEMS+ e nunca "SEMS Portal"', () => {
    const html = renderImportarSitesPage({ user: undefined });
    expect(html).toContain('GoodWe (SEMS+)');
    expect(html).not.toMatch(/SEMS Portal/i);
  });

  it('a mensagem de erro da rota de importar também diz SEMS+', () => {
    const src = readFileSync(new URL('../src/modules/dashboard/router.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/SEMS Portal/);
  });
});
