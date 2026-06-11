// tests/financeiro-resumo-lancamento.test.ts
import { describe, it, expect } from 'vitest';
import { montarResumoPendente, montarPedidoPfPj, montarConfirmacaoApagar } from '../src/modules/financeiro/resumo-lancamento.js';

const base = {
  id: 'abc-123', tipo: 'despesa' as const, valor: 380, data_evento: '2026-06-11',
  contraparte: 'Posto Shell', categoriaNome: 'Combustível', pf_pj: 'PJ' as const,
};

describe('financeiro/resumo: pendente completo', () => {
  it('mostra tudo que leu + 3 botões', () => {
    const r = montarResumoPendente(base, { duplicado: false });
    // toLocaleString pt-BR usa espaço NBSP entre "R$" e o número — testar só o número
    expect(r.body).toContain('380,00');
    expect(r.body).toContain('Posto Shell');
    expect(r.body).toContain('Combustível');
    expect(r.body).toContain('PJ');
    expect(r.buttons).toEqual([
      { id: 'finlan:conf:abc-123', title: 'Confirmar' },
      { id: 'finlan:corr:abc-123', title: 'Corrigir' },
      { id: 'finlan:desc:abc-123', title: 'Descartar' },
    ]);
  });
  it('entrada usa 💰 e despesa usa 💸', () => {
    expect(montarResumoPendente(base, { duplicado: false }).body).toContain('💸');
    expect(montarResumoPendente({ ...base, tipo: 'entrada' }, { duplicado: false }).body).toContain('💰');
  });
  it('duplicado vira aviso + botão "Lançar mesmo assim"', () => {
    const r = montarResumoPendente(base, { duplicado: true });
    expect(r.body).toContain('⚠️');
    expect(r.buttons[0].title).toBe('Lançar mesmo assim');
  });
});

describe('financeiro/resumo: pedir PF/PJ', () => {
  it('2 botões com o id do lançamento', () => {
    const r = montarPedidoPfPj('abc-123');
    expect(r.buttons).toEqual([
      { id: 'finlan:pj:abc-123', title: 'PJ (empresa)' },
      { id: 'finlan:pf:abc-123', title: 'PF (pessoal)' },
    ]);
  });
});

describe('financeiro/resumo: apagar', () => {
  it('mostra o lançamento e pede confirmação', () => {
    const r = montarConfirmacaoApagar(base);
    expect(r.body).toContain('380,00');
    expect(r.buttons[0]).toEqual({ id: 'finlan:apg:abc-123', title: 'Apagar mesmo' });
    expect(r.buttons[1]).toEqual({ id: 'finlan:noop:0', title: 'Deixa como está' });
  });
});
