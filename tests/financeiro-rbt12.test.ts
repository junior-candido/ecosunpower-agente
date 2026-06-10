import { describe, it, expect } from 'vitest';
import { mesesAnteriores, calcularRBT12, type BucketReceita } from '../src/modules/financeiro/rbt12.js';

describe('financeiro/rbt12: meses anteriores', () => {
  it('lista os 12 meses antes de jun/2026 (não inclui o próprio mês)', () => {
    const m = mesesAnteriores('2026-06', 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2026-05');
    expect(m[11]).toBe('2025-06');
    expect(m).not.toContain('2026-06');
  });
});

describe('financeiro/rbt12: soma rolante', () => {
  const buckets: BucketReceita[] = [
    { competencia: '2025-05', receita: 99999 }, // fora da janela de jun/2026
    { competencia: '2025-06', receita: 10000 },
    { competencia: '2026-01', receita: 20000 },
    { competencia: '2026-05', receita: 5000 },
    { competencia: '2026-06', receita: 7777 },  // mês de apuração, não entra
  ];
  it('soma só os 12 meses anteriores à competência de referência', () => {
    expect(calcularRBT12(buckets, '2026-06')).toBe(35000); // 10000+20000+5000
  });
  it('zero quando não há histórico', () => {
    expect(calcularRBT12([], '2026-06')).toBe(0);
  });
});
