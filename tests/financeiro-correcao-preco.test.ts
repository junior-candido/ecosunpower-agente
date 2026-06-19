import { describe, it, expect } from 'vitest';
import { parseCorrecaoPrecoMaterial, maisRecentePorLoja } from '../src/modules/financeiro/correcao-preco.js';

describe('parseCorrecaoPrecoMaterial', () => {
  it('material + loja + valor', () => {
    expect(parseCorrecaoPrecoMaterial('a curva 90 da Itaiaia era 8'))
      .toEqual({ material: 'curva 90', loja: 'Itaiaia', valorNovo: 8 });
    expect(parseCorrecaoPrecoMaterial('o cabo 6mm na Eletro X foi 5,50'))
      .toEqual({ material: 'cabo 6mm', loja: 'Eletro X', valorNovo: 5.5 });
  });
  it('material + valor (sem loja)', () => {
    expect(parseCorrecaoPrecoMaterial('a curva 90 era 7'))
      .toEqual({ material: 'curva 90', loja: null, valorNovo: 7 });
  });
  it('frase que não é correção de preço → null', () => {
    expect(parseCorrecaoPrecoMaterial('gastei 380 no posto')).toBeNull();
    expect(parseCorrecaoPrecoMaterial('preço do DPS')).toBeNull();
    expect(parseCorrecaoPrecoMaterial('a curva era boa')).toBeNull(); // sem valor
  });
});

describe('maisRecentePorLoja', () => {
  it('1 por loja, a mais recente', () => {
    const rows = [
      { id: 'a', material: 'curva', loja: 'Itaiaia', preco_unitario: 7, data_evento: '2026-06-19' },
      { id: 'b', material: 'curva', loja: 'Itaiaia', preco_unitario: 9, data_evento: '2026-06-01' },
      { id: 'c', material: 'curva', loja: 'Eletro X', preco_unitario: 8, data_evento: '2026-06-10' },
    ];
    const r = maisRecentePorLoja(rows);
    expect(r.map(x => x.id)).toEqual(['a', 'c']);
  });
});

import { montarConfirmacaoCorrecao } from '../src/modules/financeiro/correcao-preco.js';
describe('montarConfirmacaoCorrecao', () => {
  const alvo = { id: 'a', material: 'curva 90', loja: 'Itaiaia', preco_unitario: 7, data_evento: '2026-06-19' };
  it('1 alvo → pergunta direta com botão ok', () => {
    const msg = montarConfirmacaoCorrecao([alvo], 8);
    expect(msg.body).toContain('curva 90');
    expect(msg.body).toContain('Itaiaia');
    expect(msg.buttons[0].id).toBe('matcorr:ok:a:800'); // 8,00 = 800 centavos
  });
  it('vários alvos → pede qual loja (1 botão por loja)', () => {
    const msg = montarConfirmacaoCorrecao([alvo, { ...alvo, id: 'c', loja: 'Eletro X' }], 8);
    expect(msg.buttons).toHaveLength(2);
    expect(msg.buttons.map(b => b.title)).toEqual(['Itaiaia', 'Eletro X']);
  });
  it('nenhum alvo → null', () => {
    expect(montarConfirmacaoCorrecao([], 8)).toBeNull();
  });
});
