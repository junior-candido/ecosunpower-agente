import { describe, it, expect } from 'vitest';
import { montarDadosInputCompleto } from '../src/modules/proposal/dados-input.js';

describe('montarDadosInputCompleto', () => {
  const data = { nomeCliente: 'Marcelo', potenciaKwp: 8.4, valorTotalRs: 38500, modulo: { fabricante: 'Trina', quantidade: 12 }, inversor: { fabricante: 'Sungrow' }, tarifaRsKwh: 1.05 };
  it('preserva o data completo (pra reabrir)', () => {
    const d = montarDadosInputCompleto(data, 38500);
    expect(d.nomeCliente).toBe('Marcelo');
    expect(d.modulo).toEqual({ fabricante: 'Trina', quantidade: 12 });
    expect(d.tarifaRsKwh).toBe(1.05);
  });
  it('mantém os campos que o dashboard lê (potenciaKwp top-level + investimento.total)', () => {
    const d = montarDadosInputCompleto(data, 41300);
    expect(d.potenciaKwp).toBe(8.4);
    expect((d.investimento as any).total).toBe(41300);
  });
});
