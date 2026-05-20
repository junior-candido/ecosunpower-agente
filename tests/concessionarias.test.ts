// tests/concessionarias.test.ts
import { describe, it, expect } from 'vitest';
import { CONCESSIONARIAS_BR, getConcessionariaById, getConcessionariasByUF } from '../src/modules/concessionarias.js';

describe('CONCESSIONARIAS_BR', () => {
  it('tem pelo menos 29 entradas + "outra"', () => {
    expect(CONCESSIONARIAS_BR.length).toBeGreaterThanOrEqual(30);
    expect(CONCESSIONARIAS_BR.some(c => c.id === 'outra')).toBe(true);
  });

  it('tem Neoenergia-DF e Equatorial-GO (foco EcoSun)', () => {
    expect(CONCESSIONARIAS_BR.some(c => c.id === 'neoenergia-df' && c.uf === 'DF')).toBe(true);
    expect(CONCESSIONARIAS_BR.some(c => c.id === 'equatorial-go' && c.uf === 'GO')).toBe(true);
  });

  it('todas têm id, nome, uf (ou null pra "outra")', () => {
    for (const c of CONCESSIONARIAS_BR) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.nome).toBe('string');
      expect(c.uf === null || typeof c.uf === 'string').toBe(true);
    }
  });

  it('getConcessionariaById retorna match', () => {
    expect(getConcessionariaById('neoenergia-df')?.nome).toBe('Neoenergia Brasília');
    expect(getConcessionariaById('inexistente')).toBeNull();
  });

  it('getConcessionariasByUF filtra por estado', () => {
    const sp = getConcessionariasByUF('SP');
    expect(sp.length).toBeGreaterThanOrEqual(2);
    expect(sp.every(c => c.uf === 'SP')).toBe(true);
  });
});
