// Testa o parse da curva do dia da FoxESS (/op/v0/device/history/query):
// junta generationPower (kW) + todayYield (kWh) por horário; ignora as outras
// variáveis (tensão/corrente/temp = telemetria, ligadas depois). Timestamps já BRT.

import { describe, it, expect } from 'vitest';
import { parseFoxHistory } from '../src/modules/monitoring/adapters/foxess.js';

describe('parseFoxHistory', () => {
  it('junta potência+energia por hora, ordena, e ignora outras variáveis', () => {
    const datas = [
      { variable: 'generationPower', data: [
        { time: '2026-07-03 12:16:41 BRT-0300', value: 1.837 },
        { time: '2026-07-03 09:00:00 BRT-0300', value: 0.5 },
      ] },
      { variable: 'todayYield', data: [
        { time: '2026-07-03 12:16:41 BRT-0300', value: 8.2 },
        { time: '2026-07-03 09:00:00 BRT-0300', value: 1 },
      ] },
      { variable: 'RVolt', data: [{ time: '2026-07-03 12:16:41 BRT-0300', value: 232.6 }] }, // ignorada
    ];
    expect(parseFoxHistory(datas)).toEqual([
      { hora: '09:00', kw: 0.5, kwh: 1 },
      { hora: '12:16', kw: 1.837, kwh: 8.2 },
    ]);
  });

  it('ponto só com potência (sem energia) mantém kw sem kwh; negativo vira 0', () => {
    const datas = [
      { variable: 'generationPower', data: [
        { time: '2026-07-03 18:00:00 BRT-0300', value: -0.1 },
        { time: '2026-07-03 06:30:00 BRT-0300', value: 0.2 },
      ] },
    ];
    const out = parseFoxHistory(datas);
    expect(out).toEqual([
      { hora: '06:30', kw: 0.2 },
      { hora: '18:00', kw: 0 },
    ]);
    expect(out[0].kwh).toBeUndefined();
  });

  it('descarta valores nulos/inválidos', () => {
    const datas = [{ variable: 'generationPower', data: [
      { time: '2026-07-03 12:00:00 BRT-0300', value: null },
      { time: 'lixo', value: 5 },
    ] }];
    expect(parseFoxHistory(datas)).toEqual([]);
  });
});
