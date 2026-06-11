// tests/abordagem-numeros.test.ts
import { describe, it, expect } from 'vitest';
import { numerosTrimestre, recuperacaoPosLimpeza } from '../src/modules/monitoring/abordagem/numeros-usina.js';

describe('abordagem/numeros: trimestre', () => {
  it('soma kWh dos últimos 90 dias e converte em R$ pela tarifa', () => {
    const geracoes = [
      { data: '2026-06-10', geracao_kwh: 30 },
      { data: '2026-05-10', geracao_kwh: 40 },
      { data: '2026-02-01', geracao_kwh: 99 }, // fora dos 90d
    ];
    const r = numerosTrimestre(geracoes, 1.05, new Date('2026-06-11T12:00:00Z'));
    expect(r.kwh).toBe(70);
    expect(r.reais).toBe(73.5); // 70 × 1.05
  });
  it('sem dados → null (nunca inventa número)', () => {
    expect(numerosTrimestre([], 1.05, new Date())).toBeNull();
  });
});

describe('abordagem/numeros: recuperação pós-limpeza', () => {
  it('compara média 7d antes × depois', () => {
    const antes = [10, 10, 10, 10, 10, 10, 10];
    const depois = [12, 12, 12, 12, 12, 12, 12];
    expect(recuperacaoPosLimpeza(antes, depois)).toBe(20); // +20%
  });
  it('sem dados suficientes → null', () => {
    expect(recuperacaoPosLimpeza([10], [12, 12])).toBeNull();
  });
});
