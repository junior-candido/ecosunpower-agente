import { describe, it, expect } from 'vitest';
import { montarKitPorLoja } from '../src/modules/vendas/lojas/kit.js';
import type { ItemCatalogo } from '../src/modules/vendas/lojas/catalogo-loja.js';

const it0 = (o: Partial<ItemCatalogo>): ItemCatalogo => ({
  fonte: 'belenus', categoria: 'modulo', sku: 's', marca: 'X', modelo: 'm', descricao: '',
  potenciaW: null, precoUnitario: 100, precoCheio: null, estoque: null, datasheet: null,
  rsPorWp: null, atualizadoEmMs: 1, ...o,
});

describe('montarKitPorLoja', () => {
  const itens = [
    // Belenus
    it0({ fonte: 'belenus', categoria: 'modulo', potenciaW: 615, precoUnitario: 550, marca: 'TCL' }),
    it0({ fonte: 'belenus', categoria: 'modulo', potenciaW: 615, precoUnitario: 590, marca: 'JA' }),
    it0({ fonte: 'belenus', categoria: 'inversor_string', potenciaW: 8000, precoUnitario: 2800, marca: 'GROWATT-ish' }),
    it0({ fonte: 'belenus', categoria: 'estrutura', potenciaW: null, precoUnitario: 15, marca: 'belenergy' }),
    // Sol Fácil
    it0({ fonte: 'solfacil', categoria: 'modulo', potenciaW: 615, precoUnitario: 600, marca: 'OSDA' }),
    it0({ fonte: 'solfacil', categoria: 'inversor_string', potenciaW: 8000, precoUnitario: 4200, marca: 'GOODWE' }),
    // Sol Fácil sem estrutura
  ];

  it('monta kit e soma por loja (módulos×qtd + inversor + estrutura×qtd)', () => {
    const kits = montarKitPorLoja(itens, { modulos: 12, wpModulo: 615, inversorKw: 8 });
    const bel = kits.find((k) => k.fonte === 'belenus')!;
    expect(bel.modulo!.preco).toBe(550);          // pegou o mais barato (TCL)
    expect(bel.moduloTotal).toBe(6600);           // 550×12
    expect(bel.inversorTotal).toBe(2800);
    expect(bel.estruturaTotal).toBe(180);         // 15×12
    expect(bel.total).toBe(9580);
    expect(bel.faltando).toEqual([]);
  });

  it('marca faltando quando loja não tem uma categoria', () => {
    const kits = montarKitPorLoja(itens, { modulos: 12, wpModulo: 615, inversorKw: 8 });
    const sf = kits.find((k) => k.fonte === 'solfacil')!;
    expect(sf.estrutura).toBeNull();
    expect(sf.faltando).toContain('estrutura');
  });

  it('ordena: kits completos e mais baratos primeiro', () => {
    const kits = montarKitPorLoja(itens, { modulos: 12, wpModulo: 615, inversorKw: 8 });
    // belenus é completo → vem antes da solfacil (que falta estrutura)
    expect(kits[0].fonte).toBe('belenus');
  });

  it('filtra Wp do módulo (não pega potência errada)', () => {
    const mix = [...itens, it0({ fonte: 'belenus', categoria: 'modulo', potenciaW: 715, precoUnitario: 400, marca: 'BARATO' })];
    const kits = montarKitPorLoja(mix, { modulos: 10, wpModulo: 615, inversorKw: 8 });
    const bel = kits.find((k) => k.fonte === 'belenus')!;
    expect(bel.modulo!.potenciaW).toBe(615); // ignora o 715 mais barato
  });
});
