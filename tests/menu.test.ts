import { describe, it, expect, vi } from 'vitest';
import {
  construirMenu, rowsCategorias, rowsSubmenu, categoriasAcimaDoLimite,
  VOLTAR_ROW, MAX_ROWS_LISTA, type MenuDeps,
} from '../src/modules/menu/menu.js';

function depsStub(): MenuDeps {
  const h = () => vi.fn(async () => true);
  const a = () => vi.fn(async () => {});
  return {
    pricing: h(), proposal: h(), closing: h(), creative: h(), banner: h(),
    bannerKits: h(), reativarBase: h(), juniorBlog: h(), scheduling: h(),
    caseCreator: h(), testimonialAdmin: h(), relatorio: h(), resgatarForms: h(),
    googleAds: h(), acaoImposto: a(), acaoApagar: a(),
  };
}

describe('menu — estrutura', () => {
  it('tem as 6 categorias na ordem esperada', () => {
    const cats = construirMenu(depsStub());
    expect(cats.map(c => c.id)).toEqual([
      'propostas', 'fechamento', 'marketing', 'atendimento', 'financeiro', 'operacao',
    ]);
  });

  it('rowsCategorias devolve uma row por categoria com id menucat_*', () => {
    const cats = construirMenu(depsStub());
    const rows = rowsCategorias(cats);
    expect(rows).toHaveLength(6);
    expect(rows.every(r => r.id.startsWith('menucat_'))).toBe(true);
  });
});

describe('menu — Voltar', () => {
  it('todo submenu termina com a linha Voltar', () => {
    const cats = construirMenu(depsStub());
    for (const cat of cats) {
      const rows = rowsSubmenu(cat);
      expect(rows[rows.length - 1]).toEqual(VOLTAR_ROW);
    }
  });

  it('a row Voltar reabre o menu (id = "menu")', () => {
    expect(VOLTAR_ROW.id).toBe('menu');
  });
});

describe('menu — limite do WhatsApp', () => {
  it('nenhuma categoria passa de 10 rows (itens + Voltar)', () => {
    const cats = construirMenu(depsStub());
    expect(categoriasAcimaDoLimite(cats)).toEqual([]);
    expect(MAX_ROWS_LISTA).toBe(10);
  });
});
