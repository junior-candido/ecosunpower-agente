import { describe, it, expect } from 'vitest';
import { parseTelemetriaRealTime } from '../src/modules/monitoring/adapters/sungrow.js';

describe('parseTelemetriaRealTime', () => {
  it('mapeia pontos nativos -> leituras normalizadas (W->kW via fator, mantém V/A)', () => {
    const cat = new Map([
      ['24', { ponto: 'potencia', unidade: 'kW', fator: 0.001 }],
      ['13112', { ponto: 'tensao_cc_mppt1', unidade: 'V', fator: 1 }],
    ]);
    const rd = { device_point_list: [
      { ps_key: 'K1', p24: '73000.0', p13112: '780.0', p999: '1' /* fora do catálogo: ignora */ },
    ] };
    const out = parseTelemetriaRealTime(rd, cat, '2026-07-03T17:15:00Z');
    expect(out).toEqual([
      { deviceKey: 'K1', leituras: [
        { ponto: 'potencia', valor: 73, unidade: 'kW', ts: '2026-07-03T17:15:00Z' },
        { ponto: 'tensao_cc_mppt1', valor: 780, unidade: 'V', ts: '2026-07-03T17:15:00Z' },
      ] },
    ]);
  });

  it('device sem nenhuma leitura catalogada é omitido', () => {
    const cat = new Map([['24', { ponto: 'potencia', unidade: 'kW', fator: 0.001 }]]);
    const rd = { device_point_list: [{ ps_key: 'K2', p999: '5' }] };
    expect(parseTelemetriaRealTime(rd, cat, 'T')).toEqual([]);
  });
});
