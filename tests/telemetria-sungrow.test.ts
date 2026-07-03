import { describe, it, expect } from 'vitest';
import { parseTelemetriaRealTime } from '../src/modules/monitoring/adapters/sungrow.js';

describe('parseTelemetriaRealTime', () => {
  // Estrutura REAL da getDeviceRealTimeData (validada ao vivo 03/07): os valores
  // ficam aninhados em `device_point`.
  it('lê o device_point aninhado; normaliza (W->kW via fator, mantém V/A)', () => {
    const cat = new Map([
      ['24', { ponto: 'potencia', unidade: 'kW', fator: 0.001 }],
      ['5', { ponto: 'tensao_mppt1', unidade: 'V', fator: 1 }],
      ['6', { ponto: 'corrente_mppt1', unidade: 'A', fator: 1 }],
    ]);
    const rd = { device_point_list: [
      { device_point: { ps_key: '1517903_1_1_1', device_sn: 'A24', p24: '72036.0', p5: '721.3', p6: '12.5', p999: '1' } },
    ] };
    const out = parseTelemetriaRealTime(rd, cat, '2026-07-03T17:15:00Z');
    expect(out).toEqual([
      { deviceKey: '1517903_1_1_1', leituras: [
        { ponto: 'potencia', valor: 72.036, unidade: 'kW', ts: '2026-07-03T17:15:00Z' },
        { ponto: 'tensao_mppt1', valor: 721.3, unidade: 'V', ts: '2026-07-03T17:15:00Z' },
        { ponto: 'corrente_mppt1', valor: 12.5, unidade: 'A', ts: '2026-07-03T17:15:00Z' },
      ] },
    ]);
  });

  it('aceita também o formato achatado (fallback)', () => {
    const cat = new Map([['24', { ponto: 'potencia', unidade: 'kW', fator: 0.001 }]]);
    const rd = { device_point_list: [{ ps_key: 'K1', p24: '73000.0' }] };
    expect(parseTelemetriaRealTime(rd, cat, 'T')).toEqual([
      { deviceKey: 'K1', leituras: [{ ponto: 'potencia', valor: 73, unidade: 'kW', ts: 'T' }] },
    ]);
  });

  it('device sem nenhuma leitura catalogada é omitido', () => {
    const cat = new Map([['24', { ponto: 'potencia', unidade: 'kW', fator: 0.001 }]]);
    const rd = { device_point_list: [{ device_point: { ps_key: 'K2', p999: '5' } }] };
    expect(parseTelemetriaRealTime(rd, cat, 'T')).toEqual([]);
  });
});
