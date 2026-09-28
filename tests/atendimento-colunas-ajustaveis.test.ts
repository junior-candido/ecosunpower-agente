import { describe, it, expect } from 'vitest';
import { renderAtendimentoPage, CSS_ATENDIMENTO } from '../src/modules/dashboard/atendimento-views.js';
import { USER_CASA, LISTA_CONVERSAS } from './fixtures/miolo-leads.js';

// Junior (28/09): a lista de conversas ficou estreita, os filtros cortavam e
// ele quer poder arrastar as colunas para aumentar/diminuir.
describe('Conversas — colunas ajustáveis e filtros visíveis', () => {
  const h = renderAtendimentoPage({ user: USER_CASA, lista: LISTA_CONVERSAS, filtros: {}, lead: null });

  it('filtros quebram em linhas (nada cortado) em vez de rolar escondido', () => {
    expect(CSS_ATENDIMENTO).toContain('.cc-at-chips{flex-wrap:wrap');
    expect(CSS_ATENDIMENTO).not.toMatch(/\.cc-at-chips\{[^}]*nowrap/);
  });

  it('a grade usa larguras guardadas em variáveis (lista mais larga por padrão)', () => {
    expect(CSS_ATENDIMENTO).toContain('var(--at-l,minmax(300px,360px))');
    expect(CSS_ATENDIMENTO).toContain('var(--at-r,minmax(300px,340px))');
  });

  it('duas alças de arrastar, acessíveis (separator + teclado)', () => {
    const alcas = h.match(/class="cc-at-alca[^"]*"[^>]*role="separator"/g) ?? [];
    expect(alcas.length).toBe(2);
    expect(h).toContain('aria-orientation="vertical"');
    expect(h).toContain('tabindex="0"');
  });

  it('script das alças: limites de largura, guarda com try/catch e duplo clique volta ao padrão', () => {
    expect(h).toContain('cc-at-larguras');
    expect(h).toMatch(/try\{[^}]*localStorage/);
    expect(h).toContain('dblclick');
    expect(h).toContain('ArrowLeft');
  });
});
