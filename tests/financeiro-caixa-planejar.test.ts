import { describe, it, expect } from 'vitest';
import { planejarCaptura } from '../src/modules/financeiro/caixa-entrada.js';
import type { ExtracaoLancamento } from '../src/modules/financeiro/extrator-lancamento.js';

const item = (p: Partial<ExtracaoLancamento>): ExtracaoLancamento => ({
  financeiro: true, intencao: 'lancar', tipo: 'despesa', valor: 10, data: null,
  contraparte: null, categoria_slug: null, pf_pj: null, obra_ref: null,
  descricao: null, campos_faltando: [], relacionado: null, ...p,
});

describe('financeiro/caixa: planejarCaptura', () => {
  it('dois eventos financeiros → lançar os dois, sem esclarecer', () => {
    const r = planejarCaptura([item({ tipo: 'entrada', valor: 9000 }), item({ tipo: 'despesa', valor: 1500 })]);
    expect(r.lancar).toHaveLength(2);
    expect(r.esclarecer).toBe(false);
  });
  it('nenhum item financeiro → esclarecer (nunca calar)', () => {
    expect(planejarCaptura([]).esclarecer).toBe(true);
    expect(planejarCaptura([item({ financeiro: false })]).esclarecer).toBe(true);
  });
  it('ignora itens com financeiro:false e mantém os válidos', () => {
    const r = planejarCaptura([item({ valor: 50 }), item({ financeiro: false })]);
    expect(r.lancar).toHaveLength(1);
    expect(r.esclarecer).toBe(false);
  });
});
