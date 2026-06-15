// tests/calculator-geracao-estudo.test.ts
// Geração mês a mês do estudo: a curva do gráfico segue os 12 valores do PVSol,
// e a média vira a geração dos indicadores. Pedido Junior 15/06/2026.
import { describe, it, expect } from 'vitest';
import { calcular, type ProposalInput } from '../src/modules/proposal/calculator.js';

const baseInput = (over: Partial<ProposalInput> = {}): ProposalInput => ({
  potenciaKwp: 34.8, fatorPerda: 0.78, hsp: 5.2,
  consumoMensalKwh: 3600, tarifaRsKwh: 1.05, reajusteAnualEnergia: 0.10,
  tusdFioBRsKwh: 0.30, percentualFioBVigente: 0.60, percentualGeracaoInjetada: 0.70,
  custoIluminacaoPublica: 35, valorTotalRs: 124879.25, vidaUtilAnos: 25,
  ...over,
});

const geracaoEstudo = [5019, 4917, 5010, 4754, 4704, 4682, 5015, 5652, 5638, 5446, 4869, 5181];
const mediaEstudo = geracaoEstudo.reduce((a, b) => a + b, 0) / 12;

describe('calcular — geração mês a mês do estudo', () => {
  it('a curva (geracaoMensalDistribuida) segue exatamente os 12 valores do estudo', () => {
    const r = calcular(baseInput({ geracaoMensalKwhDistribuidoOverride: geracaoEstudo }));
    expect(r.geracaoMensalDistribuida).toEqual(geracaoEstudo);
  });

  it('a geração dos indicadores é a média dos 12', () => {
    const r = calcular(baseInput({ geracaoMensalKwhDistribuidoOverride: geracaoEstudo }));
    expect(r.geracaoMensalKwh).toBeCloseTo(mediaEstudo, 5);
    expect(r.geracaoAnualKwh).toBeCloseTo(mediaEstudo * 12, 5);
  });

  it('o override mês-a-mês tem prioridade sobre o override único', () => {
    const r = calcular(baseInput({ geracaoMensalKwhDistribuidoOverride: geracaoEstudo, geracaoMensalKwhOverride: 9999 }));
    expect(r.geracaoMensalDistribuida).toEqual(geracaoEstudo);
    expect(r.geracaoMensalKwh).toBeCloseTo(mediaEstudo, 5);
  });

  it('SEM override mês-a-mês mantém a curva de sazonalidade padrão (comportamento antigo intacto)', () => {
    const r = calcular(baseInput({ geracaoMensalKwhOverride: 5000 }));
    expect(r.geracaoMensalDistribuida).toHaveLength(12);
    expect(r.geracaoMensalDistribuida).not.toEqual(geracaoEstudo);
    expect(r.geracaoMensalKwh).toBe(5000);
  });

  it('array inválido (≠ 12 valores) cai no comportamento padrão', () => {
    const r = calcular(baseInput({ geracaoMensalKwhDistribuidoOverride: [100, 200], geracaoMensalKwhOverride: 5000 }));
    expect(r.geracaoMensalKwh).toBe(5000);
    expect(r.geracaoMensalDistribuida).not.toEqual([100, 200]);
  });
});
