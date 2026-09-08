import { describe, it, expect } from 'vitest';
import { escalaDoGrafico } from '../src/modules/dashboard/medicao-views.js';

// O eixo zero tem que ficar onde ele realmente esta: no topo quando so ha
// injecao, embaixo quando so ha consumo, e no meio proporcional quando ha os
// dois. Errar isso desenha consumo como se fosse injecao.
describe('escalaDoGrafico', () => {
  it('so consumo: o zero fica na base', () => {
    const e = escalaDoGrafico([100, 500, 200], 100);
    expect(e.yZero).toBe(100);
    expect(e.maxCima).toBe(500);
    expect(e.maxBaixo).toBe(0);
  });

  it('so injecao: o zero fica no topo', () => {
    const e = escalaDoGrafico([-100, -500], 100);
    expect(e.yZero).toBe(0);
    expect(e.maxBaixo).toBe(500);
    expect(e.maxCima).toBe(0);
  });

  // Casa que consome 1 kW e injeta 3 kW: o zero fica a 1/4 do topo, porque a
  // injecao ocupa 3/4 da altura.
  it('os dois: o zero fica proporcional', () => {
    const e = escalaDoGrafico([1000, -3000], 100);
    expect(e.maxCima).toBe(1000);
    expect(e.maxBaixo).toBe(3000);
    expect(e.yZero).toBeCloseTo(25, 1);
  });

  it('tudo zero nao divide por zero', () => {
    const e = escalaDoGrafico([0, 0], 100);
    expect(Number.isFinite(e.yZero)).toBe(true);
    expect(e.yZero).toBe(100);
  });

  it('lista vazia nao quebra', () => {
    const e = escalaDoGrafico([], 100);
    expect(Number.isFinite(e.yZero)).toBe(true);
  });

  it('converte valor em altura de pixel', () => {
    const e = escalaDoGrafico([1000, -1000], 100);
    expect(e.yDe(1000)).toBeCloseTo(0, 1);
    expect(e.yDe(0)).toBeCloseTo(50, 1);
    expect(e.yDe(-1000)).toBeCloseTo(100, 1);
  });
});
