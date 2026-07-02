import { describe, it, expect } from 'vitest';
import { serieMesDiaria, serieAnoMensal, navegacao } from '../src/modules/monitoring/detalhe-series.js';

const ger = [
  { data: '2026-06-29', geracao_kwh: 40 },
  { data: '2026-07-01', geracao_kwh: 42 },
  { data: '2026-07-03', geracao_kwh: 38 },
];

describe('serieMesDiaria', () => {
  it('devolve um ponto por dia do mês, 0 nos sem dado', () => {
    const s = serieMesDiaria(ger, 2026, 7);
    expect(s.length).toBe(31);
    expect(s[0]).toEqual({ data: '2026-07-01', kwh: 42 });
    expect(s[1]).toEqual({ data: '2026-07-02', kwh: 0 });
    expect(s[2]).toEqual({ data: '2026-07-03', kwh: 38 });
    expect(s[30].data).toBe('2026-07-31');
  });
  it('fevereiro bissexto tem 29 dias (2028)', () => {
    expect(serieMesDiaria([], 2028, 2).length).toBe(29);
  });
});

describe('serieAnoMensal', () => {
  it('12 meses, somando por mês; meses sem dado = 0', () => {
    const s = serieAnoMensal(ger, 2026);
    expect(s.length).toBe(12);
    expect(s[5]).toEqual({ mes: '2026-06', kwh: 40 });
    expect(s[6]).toEqual({ mes: '2026-07', kwh: 80 });
    expect(s[0]).toEqual({ mes: '2026-01', kwh: 0 });
  });
});

describe('navegacao', () => {
  const hoje = new Date('2026-07-15T00:00:00Z');
  it('mes: label pt-BR e setas; nao passa do mes de hoje', () => {
    const n = navegacao('mes', '2026-07-15', hoje, '2025-01-01');
    expect(n.label).toBe('julho de 2026');
    expect(n.anterior).toBe('2026-06-01'); // âncora no dia 1 (evita data inválida em mês curto)
    expect(n.proximo).toBeNull();
  });
  it('ano: label e setas; nao passa do ano de hoje', () => {
    const n = navegacao('ano', '2026-03-01', hoje, '2025-01-01');
    expect(n.label).toBe('2026');
    expect(n.anterior).toBe('2025-01-01'); // âncora no 1º de janeiro
    expect(n.proximo).toBeNull();
  });
  it('dia: nao passa de hoje; label dd/mm/aaaa', () => {
    const n = navegacao('dia', '2026-07-15', hoje, '2025-01-01');
    expect(n.label).toBe('15/07/2026');
    expect(n.proximo).toBeNull();
    expect(n.anterior).toBe('2026-07-14');
  });
});
