// tests/proactive-alerts-janela.test.ts
import { describe, it, expect } from 'vitest';
import { dentroDaJanela } from '../src/modules/monitoring/proactive-alerts/janela.js';

// Helper: cria Date a partir de YYYY-MM-DD HH:mm em America/Sao_Paulo (UTC-3 sem DST hoje)
function spDate(iso: string): Date {
  return new Date(iso + '-03:00');
}

describe('dentroDaJanela (America/Sao_Paulo)', () => {
  it('domingo qualquer hora -> false', () => {
    // 2026-05-17 é domingo
    expect(dentroDaJanela(spDate('2026-05-17T08:00'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-17T12:00'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-17T19:59'))).toBe(false);
  });

  it('sábado 9h-19h59 -> true; 8h59 e 20h -> false', () => {
    // 2026-05-16 é sábado
    expect(dentroDaJanela(spDate('2026-05-16T08:59'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-16T09:00'))).toBe(true);
    expect(dentroDaJanela(spDate('2026-05-16T19:59'))).toBe(true);
    expect(dentroDaJanela(spDate('2026-05-16T20:00'))).toBe(false);
  });

  it('seg-sex 8h-19h59 -> true; 7h59 e 20h -> false', () => {
    // 2026-05-18 é segunda
    expect(dentroDaJanela(spDate('2026-05-18T07:59'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-18T08:00'))).toBe(true);
    expect(dentroDaJanela(spDate('2026-05-18T19:59'))).toBe(true);
    expect(dentroDaJanela(spDate('2026-05-18T20:00'))).toBe(false);
    // 2026-05-22 é sexta
    expect(dentroDaJanela(spDate('2026-05-22T15:00'))).toBe(true);
  });

  it('madrugada (3h) -> false em qualquer dia', () => {
    expect(dentroDaJanela(spDate('2026-05-18T03:00'))).toBe(false);
    expect(dentroDaJanela(spDate('2026-05-16T03:00'))).toBe(false);
  });
});
