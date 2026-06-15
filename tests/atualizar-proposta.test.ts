// tests/atualizar-proposta.test.ts
import { describe, it, expect } from 'vitest';
import { montarRespostaAtualizar, type PropostaMatch } from '../src/modules/proposal/atualizar-proposta.js';

const BASE = 'https://dashboard.ecosunpower.eng.br';

const m = (over: Partial<PropostaMatch> = {}): PropostaMatch => ({
  slug: '800Cu_FafMgL6bbN',
  clienteNome: 'Marcelo',
  numeroProposta: 'P-2026-042',
  createdAt: '2026-06-12T13:00:00.000Z',
  valorTotal: 38500,
  ...over,
});

describe('montarRespostaAtualizar', () => {
  it('sem resultado → orienta a conferir o nome e dá a lista', () => {
    const r = montarRespostaAtualizar('Fulano', [], BASE);
    expect(r).toContain('Não achei');
    expect(r).toContain('Fulano');
    expect(r).toContain(`${BASE}/propostas`);
  });

  it('1 resultado → link direto do preview pra reabrir', () => {
    const r = montarRespostaAtualizar('Marcelo', [m()], BASE);
    expect(r).toContain('Marcelo');
    expect(r).toContain('P-2026-042');
    expect(r).toContain(`${BASE}/propostas/800Cu_FafMgL6bbN/preview`);
    expect(r).toContain('2026-06-12');
  });

  it('vários resultados → lista numerada com um link cada (valor arredondado)', () => {
    const matches = [
      m({ slug: 'AAAAAAAAAAAAAAAA', numeroProposta: 'P-1', createdAt: '2026-06-10T00:00:00Z', valorTotal: 38499.6 }),
      m({ slug: 'BBBBBBBBBBBBBBBB', numeroProposta: 'P-2', valorTotal: null }),
    ];
    const r = montarRespostaAtualizar('Marcelo', matches, BASE);
    expect(r).toContain('Achei 2 propostas');
    expect(r).toContain('1. ');
    expect(r).toContain('2. ');
    expect(r).toContain(`${BASE}/propostas/AAAAAAAAAAAAAAAA/preview`);
    expect(r).toContain(`${BASE}/propostas/BBBBBBBBBBBBBBBB/preview`);
    expect(r).toContain('R$ 38500'); // 38499.6 arredondado
    expect(r).not.toContain('R$ null'); // 2º sem valor → omite, não "R$ null"
  });

  it('nome com acento e markdown do zap não quebra a saída', () => {
    // 1 resultado → ecoa o nome do CLIENTE (com acento) + link
    const r1 = montarRespostaAtualizar('Joao', [m({ clienteNome: 'João Antônio' })], BASE);
    expect(r1).toContain('João Antônio');
    expect(r1).toContain(`${BASE}/propostas/800Cu_FafMgL6bbN/preview`);
    // 0 resultados → ecoa o TERMO buscado (com acento/markdown) sem quebrar
    const r0 = montarRespostaAtualizar('João *VIP*', [], BASE);
    expect(r0).toContain('João *VIP*');
    expect(r0).toContain('Não achei');
  });

  it('normaliza barra final da base (não gera // no link)', () => {
    const r = montarRespostaAtualizar('Marcelo', [m()], `${BASE}/`);
    expect(r).toContain(`${BASE}/propostas/800Cu_FafMgL6bbN/preview`);
    expect(r).not.toContain('eng.br//propostas');
  });
});
