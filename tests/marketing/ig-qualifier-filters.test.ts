import { describe, it, expect } from 'vitest';
import {
  qualifyByConta,
  qualifyByRegion,
  qualifyByPerfil,
} from '../../src/modules/marketing/ig-qualifier-filters.js';

describe('qualifyByConta', () => {
  it('rejeita ate_700', () => {
    expect(qualifyByConta('ate_700').qualified).toBe(false);
  });
  it('aceita 700_1500', () => {
    expect(qualifyByConta('700_1500').qualified).toBe(true);
  });
  it('aceita 1500_3000 + tag premium', () => {
    const r = qualifyByConta('1500_3000');
    expect(r.qualified).toBe(true);
    expect(r.tag).toBe('premium');
  });
  it('aceita acima_3000 + tag comercial', () => {
    const r = qualifyByConta('acima_3000');
    expect(r.qualified).toBe(true);
    expect(r.tag).toBe('comercial_alto_consumo');
  });
});

describe('qualifyByRegion', () => {
  it('aceita brasilia', () => expect(qualifyByRegion('brasilia').qualified).toBe(true));
  it('aceita aguas claras', () => expect(qualifyByRegion('Aguas Claras').qualified).toBe(true));
  it('aceita lago sul (premium)', () => expect(qualifyByRegion('Lago Sul').qualified).toBe(true));
  it('aceita anapolis (GO entorno)', () => expect(qualifyByRegion('Anapolis').qualified).toBe(true));
  it('rejeita sao paulo', () => expect(qualifyByRegion('Sao Paulo').qualified).toBe(false));
  it('rejeita salvador', () => expect(qualifyByRegion('Salvador').qualified).toBe(false));
});

describe('qualifyByPerfil', () => {
  it('aceita casa', () => expect(qualifyByPerfil('casa').qualified).toBe(true));
  it('aceita comercio', () => expect(qualifyByPerfil('comercio').qualified).toBe(true));
  it('aceita sitio', () => expect(qualifyByPerfil('sitio').qualified).toBe(true));
  it('rejeita "alugar terra"', () => {
    const r = qualifyByPerfil('Quero alugar terra pra usina solar grande');
    expect(r.qualified).toBe(false);
    expect(r.reason).toContain('alugar terra');
  });
});
