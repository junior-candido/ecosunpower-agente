// tests/abordagem-numeros.test.ts
import { describe, it, expect } from 'vitest';
import { numerosMes, recuperacaoPosLimpeza } from '../src/modules/monitoring/abordagem/numeros-usina.js';

describe('abordagem/numeros: mês', () => {
  it('PARCIAL: dia 15 → mês corrente do dia 1 até hoje (ignora futuro e mês anterior)', () => {
    const g = [
      { data: '2026-06-05', geracao_kwh: 10 },
      { data: '2026-06-15', geracao_kwh: 20 },
      { data: '2026-05-30', geracao_kwh: 99 }, // mês anterior → fora
      { data: '2026-06-20', geracao_kwh: 99 }, // depois de hoje → fora
    ];
    const r = numerosMes(g, 1.0, new Date('2026-06-15T12:00:00Z'));
    expect(r).not.toBeNull();
    expect(r!.kwh).toBe(30);
    expect(r!.reais).toBe(30);
    expect(r!.mesLabel).toBe('junho');
    expect(r!.parcial).toBe(true);
  });
  it('COMPLETO: dia 3 → mês ANTERIOR inteiro (dia 1 ao último dia)', () => {
    const g = [
      { data: '2026-05-01', geracao_kwh: 40 },
      { data: '2026-05-31', geracao_kwh: 60 },
      { data: '2026-06-02', geracao_kwh: 99 }, // mês corrente → fora
      { data: '2026-04-30', geracao_kwh: 99 }, // mês anterior ao anterior → fora
    ];
    const r = numerosMes(g, 1.05, new Date('2026-06-03T12:00:00Z'));
    expect(r).not.toBeNull();
    expect(r!.kwh).toBe(100);
    expect(r!.reais).toBe(105);
    expect(r!.mesLabel).toBe('maio');
    expect(r!.parcial).toBe(false);
  });
  it('VIRADA DE ANO: janeiro dia 2 → dezembro do ano anterior, completo', () => {
    const g = [
      { data: '2025-12-15', geracao_kwh: 50 },
      { data: '2026-01-01', geracao_kwh: 99 }, // já é janeiro → fora
    ];
    const r = numerosMes(g, 1.0, new Date('2026-01-02T12:00:00Z'));
    expect(r).not.toBeNull();
    expect(r!.kwh).toBe(50);
    expect(r!.mesLabel).toBe('dezembro');
    expect(r!.parcial).toBe(false);
  });
  it('sem dados no mês → null (nunca inventa número)', () => {
    expect(numerosMes([], 1.05, new Date('2026-06-15T12:00:00Z'))).toBeNull();
  });
  it('tarifa zero/negativa → null (nunca "R$ 0,00" num relatório)', () => {
    const g = [{ data: '2026-06-10', geracao_kwh: 30 }];
    expect(numerosMes(g, 0, new Date('2026-06-15T12:00:00Z'))).toBeNull();
    expect(numerosMes(g, -1, new Date('2026-06-15T12:00:00Z'))).toBeNull();
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
  it('dias zerados (offline) não inflam a recuperação', () => {
    const antes = [0, 0, 10, 10, 10, 10, 10, 10, 10]; // zeros fora → média 10
    const depois = [12, 12, 12, 12, 12];
    expect(recuperacaoPosLimpeza(antes, depois)).toBe(20);
  });
  it('recuperação acima de 200% é suspeita → null', () => {
    expect(recuperacaoPosLimpeza([1, 1, 1, 1, 1], [10, 10, 10, 10, 10])).toBeNull();
  });
});
