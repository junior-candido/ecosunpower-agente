// tests/monitoramento-status-real-fox-goodwe.test.ts
// Fase 2A do "alerta com motivo": FoxESS e GoodWe passam a derivar status REAL
// (antes devolviam 'desconhecido' e o alerta saía genérico).
// FoxESS /op/v0/device/list: status 1=online · 2=falha · 3=offline (por device).
// GoodWe QueryPowerStationMonitor: status -1=offline · 0=espera · 1=gerando · 2=falha.
import { describe, it, expect } from 'vitest';
import { derivarStatusFoxDevices } from '../src/modules/monitoring/adapters/foxess.js';
import { mapStatusGoodweStation } from '../src/modules/monitoring/adapters/goodwe.js';

describe('derivarStatusFoxDevices', () => {
  const sns = ['A1', 'A2', 'A3'];
  it('qualquer device meu em falha → falha (vence tudo)', () => {
    expect(derivarStatusFoxDevices([
      { deviceSN: 'A1', status: 1 }, { deviceSN: 'A2', status: 2 }, { deviceSN: 'A3', status: 3 },
    ], sns)).toBe('falha');
  });
  it('algum online (sem falha) → ok, mesmo com outros offline', () => {
    expect(derivarStatusFoxDevices([
      { deviceSN: 'A1', status: 1 }, { deviceSN: 'A2', status: 3 },
    ], sns)).toBe('ok');
  });
  it('todos os meus offline → offline', () => {
    expect(derivarStatusFoxDevices([
      { deviceSN: 'A1', status: 3 }, { deviceSN: 'A2', status: 3 }, { deviceSN: 'A3', status: 3 },
    ], sns)).toBe('offline');
  });
  it('devices de OUTRA usina não contam', () => {
    expect(derivarStatusFoxDevices([{ deviceSN: 'B9', status: 2 }], sns)).toBe('desconhecido');
  });
  it('sem status utilizável → desconhecido', () => {
    expect(derivarStatusFoxDevices([{ deviceSN: 'A1' }, { deviceSN: 'A2', status: 99 }], sns)).toBe('desconhecido');
  });
});

describe('mapStatusGoodweStation', () => {
  it('-1 → offline', () => expect(mapStatusGoodweStation(-1)).toBe('offline'));
  it('2 → falha', () => expect(mapStatusGoodweStation(2)).toBe('falha'));
  it('1 (gerando) → ok', () => expect(mapStatusGoodweStation(1)).toBe('ok'));
  it('0 (em espera, ex.: noite) → ok — standby não é problema', () =>
    expect(mapStatusGoodweStation(0)).toBe('ok'));
  it('undefined/estranho → desconhecido', () => {
    expect(mapStatusGoodweStation(undefined)).toBe('desconhecido');
    expect(mapStatusGoodweStation(77)).toBe('desconhecido');
  });
});
