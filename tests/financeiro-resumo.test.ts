import { describe, it, expect } from 'vitest';
import { montarBlocoItens, montarResumoPendente } from '../src/modules/financeiro/resumo-lancamento.js';

describe('resumo: montarBlocoItens', () => {
  it('grifa só os com problema e conta os ok', () => {
    const txt = montarBlocoItens([
      { material: 'curva 90', preco_unitario: null, problema: 'não li o preço' },
      { material: 'cabo 6mm', preco_unitario: 4, problema: null },
      { material: 'disjuntor', preco_unitario: 22, problema: null },
    ]);
    expect(txt).toContain('3 itens');
    expect(txt).toContain('⚠️');
    expect(txt).toContain('curva 90');
    expect(txt).toContain('não li o preço');
    expect(txt).toContain('2 ok');
  });
  it('todos ok → sem ⚠️', () => {
    const txt = montarBlocoItens([{ material: 'cabo', preco_unitario: 4, problema: null }]);
    expect(txt).not.toContain('⚠️');
    expect(txt).toContain('todos certos');
  });
  it('lista vazia → string vazia', () => {
    expect(montarBlocoItens([])).toBe('');
  });
  it('todos com problema → sem linha "os outros ok"', () => {
    const txt = montarBlocoItens([{ material: 'curva', preco_unitario: null, problema: 'não li o preço' }]);
    expect(txt).not.toContain('os outros');
  });
  it('mostra o preço lido no item grifado', () => {
    const txt = montarBlocoItens([{ material: 'eletroduto', preco_unitario: 12, problema: 'quantidade ilegível' }]);
    expect(txt).toContain('R$');
    expect(txt).toContain('12');
  });
});

describe('resumo: montarResumoPendente com itens', () => {
  it('inclui o bloco de itens no corpo', () => {
    const msg = montarResumoPendente(
      { id: 'l1', tipo: 'despesa', valor: 2111.8, data_evento: '2026-06-19', contraparte: 'Itaiaia', categoriaNome: null, pf_pj: 'PJ' },
      { duplicado: false, itens: [{ material: 'curva 90', preco_unitario: null, problema: 'não li o preço' }] },
    );
    expect(msg.body).toContain('⚠️');
    expect(msg.body).toContain('me corrige');
  });
});
