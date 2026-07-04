// tests/rh-store.test.ts — partes puras do store do RH
import { describe, it, expect } from 'vitest';
import { montarPathCurriculo, STATUS_VALIDOS, corteRetencao } from '../src/modules/rh/store.js';

describe('rh store (partes puras)', () => {
  it('path do currículo: vaga vira pasta, sem vaga = banco-talentos', () => {
    expect(montarPathCurriculo('abc-123')).toMatch(/^abc-123\/[0-9a-f-]{36}\.pdf$/);
    expect(montarPathCurriculo(null)).toMatch(/^banco-talentos\/[0-9a-f-]{36}\.pdf$/);
  });

  it('lista de status do funil é a combinada', () => {
    expect([...STATUS_VALIDOS]).toEqual(['novo', 'triado', 'entrevista', 'aprovado', 'reprovado']);
  });

  it('corte de retenção = 365 dias atrás, em ISO', () => {
    const agora = Date.UTC(2026, 6, 4, 12, 0, 0); // 04/07/2026 12:00Z
    const corte = corteRetencao(agora);
    expect(corte).toBe(new Date(agora - 365 * 24 * 60 * 60 * 1000).toISOString());
    expect(corte.startsWith('2025-07-04')).toBe(true);
  });
});
