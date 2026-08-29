import { describe, it, expect } from 'vitest';
import { montarRegistrado } from '../src/modules/financeiro/resumo-lancamento.js';

// brl() usa espaço não separável (U+00A0) entre "R$" e o número — normaliza pra comparar.
const flat = (s: string) => s.replace(/ /g, ' ');

describe('montarRegistrado', () => {
  it('uma linha + 2 botões (corrigir/apagar) quando confiança alta', () => {
    const m = montarRegistrado(
      { id: 'L1', tipo: 'despesa', valor: 800, data_evento: '2026-09-01', contraparte: 'Kelvyn', categoriaNome: 'Mão de obra', pf_pj: 'PJ' },
      { confianca: 'alta', obraNome: 'Superbom 305' },
    );
    expect(flat(m.body)).toBe('✅ Registrei: 💸 R$ 800,00 · Kelvyn · Mão de obra · PJ · Superbom 305 · 01/09/2026');
    expect(m.buttons.map((b) => b.id)).toEqual(['finlan:corr:L1', 'finlan:apg:L1']);
  });
  it('confiança baixa avisa que assumiu PJ e oferece PF', () => {
    const m = montarRegistrado(
      { id: 'L2', tipo: 'despesa', valor: 50, data_evento: '2026-09-01', contraparte: 'Fulano', categoriaNome: 'Outros', pf_pj: 'PJ' },
      { confianca: 'baixa', obraNome: null },
    );
    expect(m.body).toContain('assumi PJ');
    expect(m.buttons.map((b) => b.id)).toEqual(['finlan:pf:L2', 'finlan:corr:L2', 'finlan:apg:L2']);
  });
  it('entrada usa 💰 e sem obra não deixa buraco na linha', () => {
    const m = montarRegistrado(
      { id: 'L3', tipo: 'entrada', valor: 9000, data_evento: '2026-09-02', contraparte: 'João', categoriaNome: null, pf_pj: 'PJ' },
      { confianca: 'media', obraNome: null },
    );
    expect(flat(m.body)).toBe('✅ Registrei: 💰 R$ 9.000,00 · João · PJ · 02/09/2026');
  });
});
