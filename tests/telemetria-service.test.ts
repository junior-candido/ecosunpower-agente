import { describe, it, expect } from 'vitest';
import { montarCatalogo, fatorDaUnidade, agregarDia } from '../src/modules/monitoring/telemetria-service.js';

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

describe('agregarDia', () => {
  it('min/max/média por (sistema,device,ponto,dia)', () => {
    const rows = [
      { sistema_id: 'S', device_key: 'K', ponto: 'potencia', ts: '2026-01-01T09:00:00Z', valor: 10, unidade: 'kW' },
      { sistema_id: 'S', device_key: 'K', ponto: 'potencia', ts: '2026-01-01T12:00:00Z', valor: 30, unidade: 'kW' },
      { sistema_id: 'S', device_key: 'K', ponto: 'potencia', ts: '2026-01-02T12:00:00Z', valor: 20, unidade: 'kW' },
    ];
    expect(agregarDia(rows)).toEqual([
      { sistema_id: 'S', device_key: 'K', ponto: 'potencia', dia: '2026-01-01', valor_min: 10, valor_max: 30, valor_med: 20, unidade: 'kW' },
      { sistema_id: 'S', device_key: 'K', ponto: 'potencia', dia: '2026-01-02', valor_min: 20, valor_max: 20, valor_med: 20, unidade: 'kW' },
    ]);
  });
});
