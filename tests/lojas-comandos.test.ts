import { describe, it, expect, vi } from 'vitest';
import { potenciaDoTexto, filtrarPorTexto, formatarComparar, parseCotar, makeLojasHandler } from '../src/modules/vendas/lojas/comandos.js';
import type { ItemCatalogo } from '../src/modules/vendas/lojas/catalogo-loja.js';

const it0 = (o: Partial<ItemCatalogo>): ItemCatalogo => ({
  fonte: 'belenus', categoria: 'inversor_string', sku: 's', marca: 'SUNGROW', modelo: 'SG5.0',
  descricao: 'INVERSOR 5KW SUNGROW 220V', potenciaW: 5000, precoUnitario: 2761, precoCheio: null,
  estoque: null, datasheet: null, rsPorWp: null, atualizadoEmMs: 1, ...o,
});

describe('parsing', () => {
  it('potenciaDoTexto: kw e wp', () => {
    expect(potenciaDoTexto('sungrow 5kw')).toBe(5000);
    expect(potenciaDoTexto('risen 715')).toBeNull();
    expect(potenciaDoTexto('risen 715w')).toBe(715);
    expect(potenciaDoTexto('ja 625wp')).toBe(625);
  });
  it('parseCotar', () => {
    expect(parseCotar('/cotar 12000 5')).toEqual({ custoMateriais: 12000, kwp: 5 });
    expect(parseCotar('/cotar 12.000 5,5')).toEqual({ custoMateriais: 12000, kwp: 5.5 });
    expect(parseCotar('/cotar abc')).toBeNull();
  });
});

describe('filtrarPorTexto', () => {
  const itens = [
    it0({ fonte: 'belenus', marca: 'SUNGROW', potenciaW: 5000, precoUnitario: 2761, descricao: 'INVERSOR 5KW SUNGROW 220V' }),
    it0({ fonte: 'solfacil', marca: 'SUNGROW', potenciaW: 5000, precoUnitario: 2500, descricao: 'INVERSOR 5KW SUNGROW MONO 220V' }),
    it0({ fonte: 'belenus', marca: 'DEYE', potenciaW: 5000, precoUnitario: 1454, descricao: 'INVERSOR 5KW DEYE 220V' }),
    it0({ categoria: 'modulo', marca: 'RISEN', potenciaW: 715, precoUnitario: 722, descricao: 'MODULO 715W RISEN' }),
  ];
  it('casa marca + potência kW', () => {
    const r = filtrarPorTexto(itens, 'sungrow 5kw');
    expect(r).toHaveLength(2);
    expect(r.every((i) => i.marca === 'SUNGROW')).toBe(true);
  });
  it('casa módulo por Wp', () => {
    expect(filtrarPorTexto(itens, 'risen 715')).toHaveLength(1);
  });
  it('sem potência filtra só por marca', () => {
    expect(filtrarPorTexto(itens, 'deye')).toHaveLength(1);
  });
});

describe('makeLojasHandler', () => {
  const svc: any = { listarAtivos: async () => [
    it0({ fonte: 'belenus', marca: 'SUNGROW', potenciaW: 5000, precoUnitario: 2761, descricao: 'INVERSOR 5KW SUNGROW 220V' }),
    it0({ fonte: 'solfacil', marca: 'SUNGROW', potenciaW: 5000, precoUnitario: 2500, descricao: 'INVERSOR 5KW SUNGROW 220V' }),
  ] };

  it('ignora não-admin', async () => {
    const sendText = vi.fn();
    const h = makeLojasHandler({ svc, isAdminPhone: () => false, sendText });
    expect(await h('x', '/comparar sungrow 5kw')).toBe(false);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('/comparar responde com melhor preço', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const h = makeLojasHandler({ svc, isAdminPhone: () => true, sendText });
    expect(await h('admin', '/comparar sungrow 5kw')).toBe(true);
    const msg = sendText.mock.calls[0][1];
    expect(msg).toContain('Sol Fácil');
    expect(msg).toContain('🏆');
  });

  it('/cotar calcula e responde', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const h = makeLojasHandler({ svc, isAdminPhone: () => true, sendText });
    expect(await h('admin', '/cotar 12000 5')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('Preço sugerido');
  });

  it('comando desconhecido não trata', async () => {
    const h = makeLojasHandler({ svc, isAdminPhone: () => true, sendText: vi.fn() });
    expect(await h('admin', 'oi')).toBe(false);
  });
});
