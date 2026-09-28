import { describe, it, expect } from 'vitest';
import { faixaProdist } from '../src/modules/energia/prodist.js';

describe('faixaProdist (PRODIST Módulo 8, BT)', () => {
  it.each([
    [220, 202, 'adequada'], [220, 231, 'adequada'], [220, 231.1, 'precaria'], [220, 233, 'precaria'],
    [220, 233.1, 'critica'], [220, 201.9, 'precaria'], [220, 191, 'precaria'], [220, 190.9, 'critica'],
    [127, 117, 'adequada'], [127, 133.5, 'precaria'], [127, 135.1, 'critica'],
    [380, 399, 'adequada'], [380, 403.5, 'critica'],
  ])('nominal %i, %f V → %s', (nom, v, esperado) => {
    expect(faixaProdist(v, nom as 127 | 220 | 380)).toBe(esperado);
  });
  it('sem tensão ou sem nominal = null', () => {
    expect(faixaProdist(null, 220)).toBeNull();
    expect(faixaProdist(220, null)).toBeNull();
    expect(faixaProdist(Number.NaN, 220)).toBeNull();
  });
});
