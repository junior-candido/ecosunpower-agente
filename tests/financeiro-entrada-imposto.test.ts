import { describe, it, expect } from 'vitest';
import { entradaPrecisaImposto } from '../src/modules/financeiro/caixa-entrada.js';

describe('entradaPrecisaImposto', () => {
  it('entrada PJ com nota e sem conta → precisa imposto (atividade)', () => {
    expect(entradaPrecisaImposto({ tipo: 'entrada', pf_pj: 'PJ', conta_id: null, tem_nota: true })).toBe(true);
  });
  it('entrada PJ SEM nota → não precisa (caixa apenas)', () => {
    expect(entradaPrecisaImposto({ tipo: 'entrada', pf_pj: 'PJ', conta_id: null, tem_nota: false })).toBe(false);
  });
  it('despesa nunca precisa', () => {
    expect(entradaPrecisaImposto({ tipo: 'despesa', pf_pj: 'PJ', conta_id: null, tem_nota: true })).toBe(false);
  });
  it('entrada PF nunca precisa', () => {
    expect(entradaPrecisaImposto({ tipo: 'entrada', pf_pj: 'PF', conta_id: null, tem_nota: true })).toBe(false);
  });
  it('entrada já vinculada a conta não precisa de novo gate', () => {
    expect(entradaPrecisaImposto({ tipo: 'entrada', pf_pj: 'PJ', conta_id: 'x', tem_nota: true })).toBe(false);
  });
});
