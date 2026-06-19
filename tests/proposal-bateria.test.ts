import { describe, it, expect } from 'vitest';
import { temBateria, capacidadeTotalKwh, autonomiaBackupHoras, DOD_UTIL } from '../src/modules/proposal/bateria.js';

describe('bateria — temBateria', () => {
  it('true quando tem capacidade e quantidade', () => {
    expect(temBateria({ capacidadeKwh: 5, quantidade: 2 })).toBe(true);
  });
  it('false quando ausente, zerada ou negativa', () => {
    expect(temBateria(undefined)).toBe(false);
    expect(temBateria(null)).toBe(false);
    expect(temBateria({ capacidadeKwh: 0, quantidade: 1 })).toBe(false);
    expect(temBateria({ capacidadeKwh: 5, quantidade: 0 })).toBe(false);
  });
});

describe('bateria — capacidadeTotalKwh', () => {
  it('multiplica capacidade pela quantidade', () => {
    expect(capacidadeTotalKwh({ capacidadeKwh: 5, quantidade: 2 })).toBe(10);
    expect(capacidadeTotalKwh({ capacidadeKwh: 13.5, quantidade: 1 })).toBe(13.5);
  });
});

describe('bateria — autonomiaBackupHoras', () => {
  it('energia útil (90%) ÷ consumo médio horário, arredondado', () => {
    // 10 kWh * 0.9 = 9 kWh úteis; consumo 720 kWh/mês -> 720/30/24 = 1 kW; 9/1 = 9h
    expect(autonomiaBackupHoras({ capacidadeKwh: 10, quantidade: 1 }, 720)).toBe(9);
  });
  it('null quando consumo <= 0', () => {
    expect(autonomiaBackupHoras({ capacidadeKwh: 10, quantidade: 1 }, 0)).toBeNull();
  });
  it('DOD_UTIL é 0.9', () => {
    expect(DOD_UTIL).toBe(0.9);
  });
});
