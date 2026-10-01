// 01/10/2026 — Previsto × Real da frota (Command Center).
import { describe, it, expect } from 'vitest';
import { resumirPrevistoFrota } from '../src/modules/dashboard/previsto-frota.js';

const usinas = [
  { id: 'a', apelido: 'Adivan' }, { id: 'b', apelido: 'Chico' },
  { id: 'c', apelido: 'Maria' }, { id: 'd', apelido: 'Geraldo' },
];
const prev = [
  { sistema_id: 'a', kwh_previsto: '30', clima: 'limpo' },
  { sistema_id: 'b', kwh_previsto: 41, clima: 'limpo' },
  { sistema_id: 'c', kwh_previsto: 23, clima: 'limpo' },
  { sistema_id: 'd', kwh_previsto: 50, clima: 'parcial' },
  { sistema_id: 'x', kwh_previsto: 99, clima: 'limpo' }, // usina de fora / inativa
];
const reais = new Map([['a', 12], ['b', 38.2], ['d', 52.7]]);

describe('previsto × real da frota', () => {
  it('ordena piores primeiro e conta por situação', () => {
    const r = resumirPrevistoFrota(usinas, prev, reais, '2026-09-30')!;
    expect(r.linhas.map((l) => [l.apelido, l.situacao])).toEqual([
      ['Adivan', 'muito_abaixo'], ['Maria', 'sem_comunicacao'], ['Chico', 'normal'], ['Geraldo', 'normal'],
    ]);
    expect(r.porSituacao.muito_abaixo).toBe(1);
    expect(r.usinasComPrevisto).toBe(4); // a "x" (fora da empresa/inativa) não entra
  });
  it('% da frota só com quem mandou dado', () => {
    const r = resumirPrevistoFrota(usinas, prev, reais, '2026-09-30')!;
    expect(r.frotaPct).toBe(Math.round(((12 + 38.2 + 52.7) / (30 + 41 + 50)) * 1000) / 10);
  });
  it('sem previsto nenhum = null (bloco some)', () => {
    expect(resumirPrevistoFrota(usinas, [], reais, '2026-09-30')).toBeNull();
  });
});
