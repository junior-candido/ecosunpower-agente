// Testa o parse da telemetria FoxESS (/op/v0/device/real/query). A FoxESS já
// devolve nas unidades finais (kW/V/A/°C), então o valor é usado CRU (o fator do
// catálogo é ignorado). Mapeia pelo nome da variável (ponto_nativo).

import { describe, it, expect } from 'vitest';
import { parseFoxRealTime } from '../src/modules/monitoring/adapters/foxess.js';

const CAT = new Map([
  ['generationPower', { ponto: 'potencia', unidade: 'kW', fator: 0.001 }],
  ['RVolt', { ponto: 'tensao_fase_r', unidade: 'V', fator: 1 }],
  ['invTemperation', { ponto: 'temperatura', unidade: '°C', fator: 1 }],
]);

describe('parseFoxRealTime', () => {
  it('mapeia variável->ponto e usa o valor CRU (ignora fator, FoxESS já dá kW)', () => {
    const datas = [
      { variable: 'generationPower', value: 1.837 },
      { variable: 'RVolt', value: 232.6 },
      { variable: 'invTemperation', value: 51 },
      { variable: 'desconhecida', value: 9 }, // fora do catálogo -> ignora
    ];
    expect(parseFoxRealTime(datas, CAT, '2026-07-03T17:15:00Z')).toEqual([
      { ponto: 'potencia', valor: 1.837, unidade: 'kW', ts: '2026-07-03T17:15:00Z' },
      { ponto: 'tensao_fase_r', valor: 232.6, unidade: 'V', ts: '2026-07-03T17:15:00Z' },
      { ponto: 'temperatura', valor: 51, unidade: '°C', ts: '2026-07-03T17:15:00Z' },
    ]);
  });

  it('aceita valor string e descarta null/inválido', () => {
    const datas = [
      { variable: 'RVolt', value: '220.5' },
      { variable: 'generationPower', value: null },
    ];
    expect(parseFoxRealTime(datas, CAT, 'T')).toEqual([
      { ponto: 'tensao_fase_r', valor: 220.5, unidade: 'V', ts: 'T' },
    ]);
  });
});
