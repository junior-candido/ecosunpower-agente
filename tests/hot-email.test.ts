import { describe, it, expect } from 'vitest';
import { isLeadQuentePorEmail } from '../src/modules/email/hot-email.js';

describe('isLeadQuentePorEmail', () => {
  it('quente se abriu >= 3 vezes', () => {
    expect(isLeadQuentePorEmail({ aberturas: 3, cliques: 0 }, { minAberturas: 3 })).toBe(true);
  });
  it('quente se clicou ao menos 1x', () => {
    expect(isLeadQuentePorEmail({ aberturas: 1, cliques: 1 }, { minAberturas: 3 })).toBe(true);
  });
  it('nao quente se abriu 2 e nao clicou', () => {
    expect(isLeadQuentePorEmail({ aberturas: 2, cliques: 0 }, { minAberturas: 3 })).toBe(false);
  });
});
