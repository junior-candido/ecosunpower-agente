import { describe, it, expect } from 'vitest';
import { montarKitPorLoja, melhorKitCompleto, kwpDoKit } from '../src/modules/vendas/lojas/kit.js';
import type { ItemCatalogo } from '../src/modules/vendas/lojas/catalogo-loja.js';

const it0 = (o: Partial<ItemCatalogo>): ItemCatalogo => ({
  fonte: 'belenus', categoria: 'modulo', sku: 's', marca: 'X', modelo: 'm', descricao: '',
  potenciaW: null, precoUnitario: 100, precoCheio: null, estoque: null, datasheet: null,
  rsPorWp: null, atualizadoEmMs: 1, ...o,
});

const itens = [
  it0({ fonte: 'belenus', categoria: 'modulo', potenciaW: 615, precoUnitario: 550, marca: 'TCL' }),
  it0({ fonte: 'belenus', categoria: 'modulo', potenciaW: 615, precoUnitario: 590, marca: 'JA' }),
  it0({ fonte: 'belenus', categoria: 'inversor_string', potenciaW: 8000, precoUnitario: 2800, marca: 'SUNGROW' }),
  it0({ fonte: 'solfacil', categoria: 'modulo', potenciaW: 615, precoUnitario: 600, marca: 'OSDA' }),
  it0({ fonte: 'solfacil', categoria: 'inversor_string', potenciaW: 8000, precoUnitario: 4200, marca: 'GOODWE' }),
  it0({ fonte: 'fortlev', categoria: 'inversor_string', potenciaW: 8000, precoUnitario: 3000, marca: 'DEYE' }), // fortlev SEM módulo
];

describe('montarKitPorLoja', () => {
  it('soma módulos + inversor + estrutura(R$/módulo informado)', () => {
    const kits = montarKitPorLoja(itens, { modulos: 12, wpModulo: 615, inversorKw: 8, estruturaRsPorModulo: 90 });
    const bel = kits.find((k) => k.fonte === 'belenus')!;
    expect(bel.modulo!.preco).toBe(550);        // mais barato (TCL)
    expect(bel.moduloTotal).toBe(6600);
    expect(bel.inversorTotal).toBe(2800);
    expect(bel.estruturaTotal).toBe(1080);      // 90×12
    expect(bel.total).toBe(10480);
    expect(bel.faltando).toEqual([]);
  });

  it('loja SEM o módulo não é mencionada (Fortlev só tem inversor)', () => {
    const kits = montarKitPorLoja(itens, { modulos: 12, wpModulo: 615, inversorKw: 8, estruturaRsPorModulo: 90 });
    expect(kits.find((k) => k.fonte === 'fortlev')).toBeUndefined();
    expect(kits.map((k) => k.fonte).sort()).toEqual(['belenus', 'solfacil']);
  });

  it('sem estrutura informada, estruturaTotal = 0', () => {
    const kits = montarKitPorLoja(itens, { modulos: 12, wpModulo: 615, inversorKw: 8 });
    expect(kits[0].estruturaTotal).toBe(0);
  });

  it('kit é de UMA loja só (módulo e inversor da mesma fonte)', () => {
    const kits = montarKitPorLoja(itens, { modulos: 10, wpModulo: 615, inversorKw: 8, estruturaRsPorModulo: 80 });
    const sf = kits.find((k) => k.fonte === 'solfacil')!;
    expect(sf.modulo!.marca).toBe('OSDA');      // módulo da Sol Fácil
    expect(sf.inversor!.marca).toBe('GOODWE');  // inversor da Sol Fácil (não pega Belenus)
  });

  it('filtra Wp e marca do módulo', () => {
    const mix = [...itens, it0({ fonte: 'belenus', categoria: 'modulo', potenciaW: 715, precoUnitario: 400, marca: 'BARATO' })];
    const kits = montarKitPorLoja(mix, { modulos: 10, wpModulo: 615, inversorKw: 8, marcaModulo: 'JA' });
    const bel = kits.find((k) => k.fonte === 'belenus')!;
    expect(bel.modulo!.marca).toBe('JA');       // respeitou a marca (não pegou o 715 mais barato)
    expect(bel.modulo!.potenciaW).toBe(615);
  });

  it('faltando inversor quando a loja tem módulo mas não o inversor pedido', () => {
    const so = [it0({ fonte: 'belenus', categoria: 'modulo', potenciaW: 615, precoUnitario: 550, marca: 'TCL' })];
    const kits = montarKitPorLoja(so, { modulos: 12, wpModulo: 615, inversorKw: 8, estruturaRsPorModulo: 90 });
    expect(kits[0].inversor).toBeNull();
    expect(kits[0].faltando).toEqual(['inversor']);
    expect(melhorKitCompleto(kits)).toBeNull(); // não é completo
  });

  it('melhorKitCompleto pega o mais barato entre os completos; kwpDoKit correto', () => {
    const kits = montarKitPorLoja(itens, { modulos: 10, wpModulo: 615, inversorKw: 8, estruturaRsPorModulo: 0 });
    const melhor = melhorKitCompleto(kits)!;
    expect(melhor.fonte).toBe('belenus');       // 550×10+2800 < 600×10+4200
    expect(kwpDoKit(melhor)).toBeCloseTo(6.15); // 615×10/1000
  });
});
