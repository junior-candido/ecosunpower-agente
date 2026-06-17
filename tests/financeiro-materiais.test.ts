import { describe, it, expect } from 'vitest';
import { parseLancamentos } from '../src/modules/financeiro/extrator-lancamento.js';

describe('extrator: campos de material', () => {
  it('extrai material, quantidade e unidade', () => {
    const raw = '```json\n[{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":400,"contraparte":"Loja Y","material":"cabo 6mm","quantidade":100,"unidade":"m"}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.material).toBe('cabo 6mm');
    expect(e.quantidade).toBe(100);
    expect(e.unidade).toBe('m');
  });
  it('sem material → null/null/null', () => {
    const raw = '```json\n[{"financeiro":true,"tipo":"despesa","valor":50,"contraparte":"posto"}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.material).toBeNull();
    expect(e.quantidade).toBeNull();
    expect(e.unidade).toBeNull();
  });
});
