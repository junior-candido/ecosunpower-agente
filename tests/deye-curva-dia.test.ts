// Testa o parse da curva do dia da Deye (station/history granularity=1 "frame"):
// timeStamp (unix seg UTC) + generationPower (W) -> { hora BRT, kw }. Brasil UTC-3.

import { describe, it, expect } from 'vitest';
import { parseDeyeFrames } from '../src/modules/monitoring/adapters/deye.js';

describe('parseDeyeFrames', () => {
  it('converte W->kW e timeStamp UTC->hora BRT (UTC-3), ordenado', () => {
    const items = [
      { timeStamp: Date.UTC(2026, 6, 3, 15, 30, 0) / 1000, generationPower: 4000 }, // 12:30 BRT
      { timeStamp: Date.UTC(2026, 6, 3, 15, 0, 0) / 1000, generationPower: 5000 },  // 12:00 BRT
    ];
    expect(parseDeyeFrames(items)).toEqual([
      { hora: '12:00', kw: 5 },
      { hora: '12:30', kw: 4 },
    ]);
  });

  it('aceita generationPower string e descarta itens sem número', () => {
    const items = [
      { timeStamp: Date.UTC(2026, 6, 3, 9, 0, 0) / 1000, generationPower: '2000' }, // 06:00 BRT
      { timeStamp: Date.UTC(2026, 6, 3, 9, 5, 0) / 1000, generationPower: null },
      { generationPower: 1000 }, // sem timeStamp -> descarta
    ];
    expect(parseDeyeFrames(items)).toEqual([{ hora: '06:00', kw: 2 }]);
  });

  it('potência negativa (ruído) vira 0', () => {
    const items = [{ timeStamp: Date.UTC(2026, 6, 3, 21, 0, 0) / 1000, generationPower: -50 }]; // 18:00 BRT
    expect(parseDeyeFrames(items)).toEqual([{ hora: '18:00', kw: 0 }]);
  });
});
