// Cronograma do Fio B da Lei 14.300/2022 (art. 27): 15% em 2023, +15 p.p./ano
// até 90% em 2028. De 2029 em diante a regra depende da metodologia da ANEEL —
// usamos 100% como teto conservador (igual percentualFioBPorAno do calculator).
import { describe, it, expect } from 'vitest';
import { percentualFioBVigente } from '../src/modules/solar-params.js';
import { percentualFioBPorAno } from '../src/modules/proposal/calculator.js';

describe('percentualFioBVigente (Lei 14.300 art. 27)', () => {
  it.each([
    [2023, 0.15], [2024, 0.30], [2025, 0.45], [2026, 0.60], [2027, 0.75], [2028, 0.90], [2029, 1.0], [2035, 1.0],
  ])('%i → %f', (ano, pct) => expect(percentualFioBVigente(ano)).toBeCloseTo(pct, 10));

  it('bate com o cronograma usado na proposta ano a ano', () => {
    for (let ano = 2023; ano <= 2032; ano++) expect(percentualFioBVigente(ano)).toBeCloseTo(percentualFioBPorAno(ano), 10);
  });
});
