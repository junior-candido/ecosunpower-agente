import { describe, it, expect } from 'vitest';
import { calcularNota, retencaoAutomatica } from '../src/modules/financeiro/fiscal/calculo.js';

describe('fiscal calculo', () => {
  it('PJ do DF: ISS 5% retido pelo tomador → líquido 95%', () => {
    const r = calcularNota({ valorBruto: 19995, aliquotaIss: 0.05, issRetido: true });
    expect(r).toEqual({ valorIss: 999.75, valorLiquido: 18995.25 });
  });
  it('PF: ISS devido pelo prestador → líquido = bruto', () => {
    const r = calcularNota({ valorBruto: 1250, aliquotaIss: 0.05, issRetido: false });
    expect(r).toEqual({ valorIss: 62.5, valorLiquido: 1250 });
  });
  it('arredonda pra 2 casas', () => {
    const r = calcularNota({ valorBruto: 333.33, aliquotaIss: 0.05, issRetido: true });
    expect(r.valorIss).toBe(16.67);
    expect(r.valorLiquido).toBe(316.66);
  });
  it('retencaoAutomatica: PJ de Brasília retém; PF não; PJ de fora não (regra do DF)', () => {
    expect(retencaoAutomatica({ tipo: 'PJ', municipio: 'Brasília', uf: 'DF' })).toBe(true);
    expect(retencaoAutomatica({ tipo: 'PF', municipio: 'Brasília', uf: 'DF' })).toBe(false);
    expect(retencaoAutomatica({ tipo: 'PJ', municipio: 'Goiânia', uf: 'GO' })).toBe(false);
  });
});
