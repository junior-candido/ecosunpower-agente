// 02/10/2026 — Alerta "abaixo do previsto" (2 dias seguidos muito abaixo).
import { describe, it, expect } from 'vitest';
import { avaliarAlertaPrevisto } from '../src/modules/monitoring/previsto/alerta.js';

const d = (data: string, previsto: number, real: number | null, clima = 'limpo') => ({ data, previsto, real, clima: clima as never });

describe('alerta abaixo do previsto', () => {
  it('2 dias seguidos muito abaixo (dia limpo) → alerta com os números', () => {
    const a = avaliarAlertaPrevisto([d('2026-09-23', 50, 49), d('2026-09-24', 52.4, 39.1), d('2026-09-25', 51.8, 40.3)]);
    expect(a.alertar).toBe(true);
    expect(a.texto).toContain('24/09: gerou 39,1 kWh, o sol permitia 52,4');
    expect(a.texto).toContain('sujeira');
  });
  it('1 dia ruim só não alerta', () => {
    expect(avaliarAlertaPrevisto([d('2026-09-24', 50, 49), d('2026-09-25', 50, 30)]).alertar).toBe(false);
  });
  it('chuva nunca vira "muito abaixo" → não alerta', () => {
    expect(avaliarAlertaPrevisto([d('2026-09-24', 12, 5, 'chuva'), d('2026-09-25', 12, 5, 'chuva')]).alertar).toBe(false);
  });
  it('dia sem leitura no meio não quebra a sequência (nem conta como defeito)', () => {
    const a = avaliarAlertaPrevisto([d('2026-09-23', 50, 30), d('2026-09-24', 50, null), d('2026-09-25', 50, 30)]);
    expect(a.alertar).toBe(true);
  });
  it('voltou ao normal → normalizou (resolve o alerta aberto)', () => {
    const a = avaliarAlertaPrevisto([d('2026-09-24', 50, 30), d('2026-09-25', 50, 30), d('2026-09-26', 50, 49)]);
    expect(a.alertar).toBe(false);
    expect(a.normalizou).toBe(true);
  });
});
