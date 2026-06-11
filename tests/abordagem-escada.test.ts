// tests/abordagem-escada.test.ts
import { describe, it, expect } from 'vitest';
import { ESCADAS, objetivoDoDegrau } from '../src/modules/monitoring/abordagem/escada.js';

describe('abordagem/escada', () => {
  it('tem escada pros 4 tipos', () => {
    expect(Object.keys(ESCADAS).sort()).toEqual(['depoimento', 'offline', 'parabens', 'queda']);
  });
  it('cada degrau tem objetivo não-vazio', () => {
    for (const tipo of Object.keys(ESCADAS) as Array<keyof typeof ESCADAS>) {
      for (const degrau of ESCADAS[tipo]) {
        expect(degrau.objetivo.length).toBeGreaterThan(20);
      }
    }
  });
  it('degrau fora do range devolve o último (lembrete)', () => {
    expect(objetivoDoDegrau('offline', 99)).toBe(ESCADAS.offline[ESCADAS.offline.length - 1].objetivo);
  });
  it('queda nunca menciona preço no objetivo', () => {
    for (const d of ESCADAS.queda) {
      expect(d.objetivo.toLowerCase()).not.toContain('preço');
      expect(d.objetivo).not.toContain('R$');
    }
  });
});
