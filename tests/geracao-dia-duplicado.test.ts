// 02/10/2026 — portal devolvendo o mesmo dia 2× não pode derrubar o upsert.
import { describe, it, expect } from 'vitest';
import { linhasGeracao } from '../src/modules/monitoring/service.js';

describe('linhasGeracao', () => {
  it('dia repetido vira uma linha só, com o maior valor', () => {
    const rows = linhasGeracao('s', 'c', [
      { data: '2026-10-01', geracao_kwh: 12.3 },
      { data: '2026-10-01', geracao_kwh: 30.1 },
      { data: '2026-10-02', geracao_kwh: 5 },
    ]);
    expect(rows.map((r) => [r.data, r.geracao_kwh])).toEqual([['2026-10-01', 30.1], ['2026-10-02', 5]]);
  });
});
