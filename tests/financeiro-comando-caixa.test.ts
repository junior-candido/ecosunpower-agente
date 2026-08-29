import { describe, it, expect } from 'vitest';
import { montarCaixa } from '../src/modules/financeiro/comando-caixa.js';

// brl() usa espaço não separável (U+00A0) entre "R$" e o número — normaliza pra comparar.
const flat = (s: string) => s.replace(/ /g, ' ');

describe('montarCaixa', () => {
  it('lista a pagar 7 dias, a receber, hoje e sem dono', () => {
    const t = flat(montarCaixa({
      hojeIso: '2026-09-01',
      aPagar7d: [{ descricao: 'LATAM', valor: 7738.58, vencimento: '2026-09-01', mundo: 'PF' }],
      aReceber: [{ descricao: 'Hudson', valor: 3633 }],
      hoje: { entradas: 0, saidas: 1200, n: 2 },
      semDono: 3,
    }));
    expect(t).toContain('A PAGAR até 08/09');
    expect(t).toContain('LATAM — R$ 7.738,58 (PF) 01/09');
    expect(t).toContain('A RECEBER: R$ 3.633,00');
    expect(t).toContain('2 lançamento(s) · entrou R$ 0,00 · saiu R$ 1.200,00');
    expect(t).toContain('3 lançamento(s) sem dono');
  });

  it('sem lançamentos sem dono, não fala em "sem dono"', () => {
    const t = montarCaixa({ hojeIso: '2026-09-01', aPagar7d: [], aReceber: [], hoje: { entradas: 0, saidas: 0, n: 0 }, semDono: 0 });
    expect(t).not.toContain('sem dono');
  });

  it('conta vencida (antes de hoje) ganha ⚠️', () => {
    const t = montarCaixa({ hojeIso: '2026-09-05', aPagar7d: [{ descricao: 'LATAM', valor: 10, vencimento: '2026-09-01', mundo: 'PF' }, { descricao: 'Sicoob', valor: 10, vencimento: '2026-09-07', mundo: 'PJ' }], aReceber: [], hoje: { entradas: 0, saidas: 0, n: 0 }, semDono: 0 });
    expect(t).toContain('• ⚠️ LATAM');
    expect(t).toContain('• Sicoob');
  });
});
