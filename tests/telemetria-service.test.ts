import { describe, it, expect } from 'vitest';
import { montarCatalogo, fatorDaUnidade } from '../src/modules/monitoring/telemetria-service.js';

describe('fatorDaUnidade', () => {
  it('kW/kWh -> 0.001; V/A/Hz/°C -> 1', () => {
    expect(fatorDaUnidade('kW')).toBe(0.001);
    expect(fatorDaUnidade('kWh')).toBe(0.001);
    expect(fatorDaUnidade('V')).toBe(1);
    expect(fatorDaUnidade('A')).toBe(1);
    expect(fatorDaUnidade('Hz')).toBe(1);
    expect(fatorDaUnidade('°C')).toBe(1);
  });
});

describe('montarCatalogo', () => {
  it('vira Map ponto_nativo -> {ponto,unidade,fator}', () => {
    const rows = [
      { ponto_nativo: '24', ponto: 'potencia', unidade: 'kW', categoria: 'potencia' },
      { ponto_nativo: '5', ponto: 'tensao_mppt1', unidade: 'V', categoria: 'tensao' },
    ];
    const m = montarCatalogo(rows);
    expect(m.get('24')).toEqual({ ponto: 'potencia', unidade: 'kW', fator: 0.001 });
    expect(m.get('5')).toEqual({ ponto: 'tensao_mppt1', unidade: 'V', fator: 1 });
  });
});
