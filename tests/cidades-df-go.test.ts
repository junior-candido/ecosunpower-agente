// tests/cidades-df-go.test.ts
import { describe, it, expect } from 'vitest';
import { CIDADES_DF, CIDADES_GO, CIDADES_DF_GO } from '../src/modules/cidades-df-go.js';

describe('CIDADES_DF_GO', () => {
  it('CIDADES_DF contém Brasília', () => {
    expect(CIDADES_DF).toContain('Brasília');
  });

  it('CIDADES_DF_GO está em ordem alfabética (pt-BR)', () => {
    for (let i = 1; i < CIDADES_DF_GO.length; i++) {
      expect(CIDADES_DF_GO[i - 1].localeCompare(CIDADES_DF_GO[i], 'pt-BR')).toBeLessThanOrEqual(0);
    }
  });

  it('não tem cidade repetida', () => {
    const unicas = new Set(CIDADES_DF_GO);
    expect(unicas.size).toBe(CIDADES_DF_GO.length);
  });

  it('o total bate com CIDADES_DF + CIDADES_GO', () => {
    expect(CIDADES_DF_GO.length).toBe(CIDADES_DF.length + CIDADES_GO.length);
  });
});
