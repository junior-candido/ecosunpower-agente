import { describe, it, expect, vi } from 'vitest';
import { potenciaDoTexto, filtrarPorTexto, formatarComparar, parseCotar, parseKitReal, formatarKitsReais, makeLojasHandler } from '../src/modules/vendas/lojas/comandos.js';
import type { ItemCatalogo } from '../src/modules/vendas/lojas/catalogo-loja.js';
import type { KitOferta } from '../src/modules/vendas/lojas/kit-oferta.js';

const kit0 = (o: Partial<KitOferta>): KitOferta => ({
  fonte: 'solfacil', region: 'DF', inversorMarca: 'SOFAR', moduloMarca: 'LEAPTON',
  descricao: 'Kit', precoTotal: 6908, rsPorWp: 1.15, itens: [], pagamentos: [], ehAlternativa: false, alerta: null, ...o,
});

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
  it('parseKitReal: kWp + micro/string + região + marca', () => {
    expect(parseKitReal('/kitreal 5')).toEqual({ power: 5 });
    expect(parseKitReal('/kitreal 8 micro')).toEqual({ power: 8, inverterType: 'micro' });
    expect(parseKitReal('/kitreal 5 go string')).toEqual({ power: 5, region: 'GO', inverterType: 'string' });
    expect(parseKitReal('/kitreal 10 deye')).toEqual({ power: 10, inverterManufacturer: 'DEYE' });
    expect(parseKitReal('/kitreal')).toBeNull();
    expect(parseKitReal('/kitreal micro')).toBeNull();
  });
});

describe('formatarKitsReais', () => {
  it('lista ofertas com preço de kit + Pix + marca o 🏆', () => {
    const kits = [
      kit0({ inversorMarca: 'SOFAR', precoTotal: 6908, rsPorWp: 1.15, pagamentos: [{ nome: 'Pix', descontoPct: 6, precoFinal: 6493.52, semJuros: null }] }),
      kit0({ inversorMarca: 'GOODWE', precoTotal: 7282.76, rsPorWp: 1.21, pagamentos: [] }),
    ];
    const msg = formatarKitsReais(kits, 5);
    expect(msg).toContain('Kit real Sol Fácil 5 kWp');
    expect(msg).toContain('🏆');
    expect(msg).toContain('SOFAR/LEAPTON');
    expect(msg).toContain('Pix');
  });
  it('avisa quando é alternativa', () => {
    expect(formatarKitsReais([kit0({ ehAlternativa: true })], 5)).toContain('alternativa');
  });
  it('vazio orienta', () => {
    expect(formatarKitsReais([], 5)).toContain('não devolveu kit');
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

  it('/kitreal puxa preço real e coteia', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const puxarKitsReais = vi.fn(async () => [
      kit0({ inversorMarca: 'SOFAR', precoTotal: 6908, rsPorWp: 1.15 }),
      kit0({ inversorMarca: 'GOODWE', precoTotal: 7282.76, rsPorWp: 1.21 }),
    ]);
    const h = makeLojasHandler({ svc, isAdminPhone: () => true, sendText, puxarKitsReais });
    expect(await h('admin', '/kitreal 5 micro')).toBe(true);
    expect(puxarKitsReais).toHaveBeenCalledWith({ power: 5, inverterType: 'micro' });
    const msg = sendText.mock.calls[0][1];
    expect(msg).toContain('Kit real Sol Fácil 5 kWp');
    expect(msg).toContain('Preço sugerido'); // cotação sobre o mais barato
  });

  it('/kitreal sem login avisa', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const h = makeLojasHandler({ svc, isAdminPhone: () => true, sendText }); // sem puxarKitsReais
    expect(await h('admin', '/kitreal 5')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('indisponível');
  });

  it('comando desconhecido não trata', async () => {
    const h = makeLojasHandler({ svc, isAdminPhone: () => true, sendText: vi.fn() });
    expect(await h('admin', 'oi')).toBe(false);
  });
});
