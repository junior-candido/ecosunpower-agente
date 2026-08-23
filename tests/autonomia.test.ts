// tests/autonomia.test.ts
import { describe, it, expect } from 'vitest';
import { consumoAlvo, decidirFaixa, servicoRsPorWp, FAIXA_AUTONOMA } from '../src/modules/vendas/autonomia.js';

describe('autonomia', () => {
  it('consumo-alvo = maior entre fatura atual e carga futura declarada (spec §2.3)', () => {
    expect(consumoAlvo({ consumoKwh: 600, cargaFuturaKwh: null })).toBe(600);
    expect(consumoAlvo({ consumoKwh: 400, cargaFuturaKwh: 800 })).toBe(800);
    expect(consumoAlvo({ consumoKwh: null, cargaFuturaKwh: 700 })).toBe(700);
    expect(consumoAlvo({ consumoKwh: null, cargaFuturaKwh: null })).toBeNull();
    expect(consumoAlvo({ consumoKwh: 0, cargaFuturaKwh: undefined })).toBeNull();
  });

  it('kWh escrito em pt-BR: "1.050" é mil e cinquenta, não um vírgula zero cinco', () => {
    expect(consumoAlvo({ consumoKwh: '1.050' })).toBe(1050);
    expect(consumoAlvo({ consumoKwh: '980,5' })).toBe(980.5);
    expect(consumoAlvo({ consumoKwh: '2.500' })).toBe(2500);
    expect(consumoAlvo({ consumoKwh: '700' })).toBe(700);
    expect(consumoAlvo({ consumoKwh: 'abc' })).toBeNull();
    expect(consumoAlvo({ consumoKwh: '600', cargaFuturaKwh: '1.200' })).toBe(1200);
  });

  it('faixa 500–1.500 = autônoma; >1.500 = chama Junior; <500 = fluxo atual', () => {
    expect(FAIXA_AUTONOMA).toEqual({ min: 500, max: 1500 });
    expect(decidirFaixa(500)).toBe('autonoma');
    expect(decidirFaixa(1500)).toBe('autonoma');
    expect(decidirFaixa(1501)).toBe('chama_junior');
    expect(decidirFaixa(499)).toBe('fluxo_atual');
    expect(decidirFaixa(null)).toBe('sem_dados');
  });

  it('serviço por faixa: 0,95 / 0,85 / 0,70 R$/Wp (faixa do meio revisada 22/08)', () => {
    expect(servicoRsPorWp(500)).toBe(0.95);
    expect(servicoRsPorWp(699)).toBe(0.95);
    expect(servicoRsPorWp(700)).toBe(0.85);
    expect(servicoRsPorWp(999)).toBe(0.85);
    expect(servicoRsPorWp(1000)).toBe(0.70);
    expect(servicoRsPorWp(1500)).toBe(0.70);
  });

  it('fora da faixa autônoma usa a ponta mais próxima (pra card de sombra acima de 1.500 ainda mostrar um número)', () => {
    expect(servicoRsPorWp(2000)).toBe(0.70);
    expect(servicoRsPorWp(300)).toBe(0.95);
  });
});
