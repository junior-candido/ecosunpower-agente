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

describe('menu — comandos novos', () => {
  const cats = construirMenu(depsStub());
  const item = (id: string) => cats.flatMap(c => c.items).find(i => i.id === id);
  const catDoItem = (id: string) => cats.find(c => c.items.some(i => i.id === id))?.id;

  it('comparador de material está no Financeiro como dica', () => {
    expect(catDoItem('menu_fin_material')).toBe('financeiro');
    expect(item('menu_fin_material')?.hint).toContain('preço do');
  });

  it('marcar como fechado está em Propostas como dica', () => {
    expect(catDoItem('menu_fechei')).toBe('propostas');
    expect(item('menu_fechei')?.hint).toContain('fechei');
  });

  it('resgatar leads de formulário está em Marketing com trigger /resgatar-forms', () => {
    expect(catDoItem('menu_resgatar_forms')).toBe('marketing');
    expect(item('menu_resgatar_forms')?.trigger).toBe('/resgatar-forms');
    expect(item('menu_resgatar_forms')?.handler).toBeTypeOf('function');
  });

  it('resumo Google Ads está em Marketing com trigger /google', () => {
    expect(catDoItem('menu_google')).toBe('marketing');
    expect(item('menu_google')?.trigger).toBe('/google');
    expect(item('menu_google')?.handler).toBeTypeOf('function');
  });

  it('banner tabela kits está em Marketing com trigger /banner-kits', () => {
    expect(catDoItem('menu_banner_kits')).toBe('marketing');
    expect(item('menu_banner_kits')?.trigger).toBe('/banner-kits');
    expect(item('menu_banner_kits')?.handler).toBeTypeOf('function');
  });

  it('cadastrar email do lead está em Atendimento como dica', () => {
    expect(catDoItem('menu_email')).toBe('atendimento');
    expect(item('menu_email')?.hint).toContain('email');
  });
});
