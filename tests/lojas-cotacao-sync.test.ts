import { describe, it, expect, vi } from 'vitest';
import { calcularCotacao, oportunidadesDesconto } from '../src/modules/vendas/lojas/cotacao.js';
import { sincronizarLojas, credenciaisDoEnv } from '../src/modules/vendas/lojas/sincronizar-lojas.js';
import type { GrupoComparacao } from '../src/modules/vendas/lojas/comparador.js';

describe('calcularCotacao', () => {
  it('imposto+margem sobre o preço de venda; lucro = margem% do preço', () => {
    const c = calcularCotacao({ custoMateriais: 10000, potenciaKwp: 5, servicoRsPorWp: 0.85, impostoPct: 6, margemAlvoPct: 25 });
    expect(c.custoServico).toBe(4250);        // 5*1000*0.85
    expect(c.custoTotal).toBe(14250);
    // preco = 14250 / (1 - 0.31) = 20652.17
    expect(c.precoSugerido).toBeCloseTo(20652.17, 1);
    expect(c.impostoValor).toBeCloseTo(c.precoSugerido * 0.06, 1);
    expect(c.lucro).toBeCloseTo(c.precoSugerido * 0.25, 0);
  });

  it('desconto máximo mantém a margem mínima', () => {
    const c = calcularCotacao({ custoMateriais: 10000, potenciaKwp: 5, servicoRsPorWp: 0.85, impostoPct: 6, margemAlvoPct: 25, margemMinimaPct: 12 });
    expect(c.precoMinimo).toBeLessThan(c.precoSugerido);
    expect(c.descontoMaxRs).toBeGreaterThan(0);
    // no preço mínimo, ainda sobra lucro (margem mínima > 0)
    expect(c.precoMinimo).toBeGreaterThan(c.custoTotal);
  });

  it('lança se imposto+margem >= 100%', () => {
    expect(() => calcularCotacao({ custoMateriais: 100, potenciaKwp: 1, servicoRsPorWp: 0, impostoPct: 60, margemAlvoPct: 45 })).toThrow();
  });
});

describe('oportunidadesDesconto', () => {
  it('lista onde há folga (>= mínimo) ordenado por economia', () => {
    const grupos = [
      { chave: 'a', categoria: 'inversor_string', marca: 'DEYE', potenciaW: 5000, tensao: 220, fase: 'mono',
        ofertas: [{ fonte: 'belenus', sku: 'x', modelo: 'x', descricao: '', preco: 1454, datasheet: null },
                  { fonte: 'solfacil', sku: 'y', modelo: 'y', descricao: '', preco: 1800, datasheet: null }],
        melhor: { fonte: 'belenus', sku: 'x', modelo: 'x', descricao: '', preco: 1454, datasheet: null },
        economia: 346, economiaPct: 19.2 },
      { chave: 'b', categoria: 'modulo', marca: 'JA', potenciaW: 625, tensao: null, fase: null,
        ofertas: [{ fonte: 'belenus', sku: 'z', modelo: 'z', descricao: '', preco: 620, datasheet: null },
                  { fonte: 'fortlev', sku: 'w', modelo: 'w', descricao: '', preco: 640, datasheet: null }],
        melhor: { fonte: 'belenus', sku: 'z', modelo: 'z', descricao: '', preco: 620, datasheet: null },
        economia: 20, economiaPct: 3.1 },
    ] as unknown as GrupoComparacao[];
    const ops = oportunidadesDesconto(grupos, 50);
    expect(ops).toHaveLength(1);       // só o DEYE (20 < 50 fica fora)
    expect(ops[0].comprandoEm).toBe('belenus');
    expect(ops[0].seComprarEm).toBe('solfacil');
    expect(ops[0].economia).toBe(346);
  });
});

describe('sincronizarLojas', () => {
  it('sem credencial = no-op', async () => {
    const catalogo: any = { upsertLote: vi.fn(), marcarSumidos: vi.fn() };
    expect(await sincronizarLojas({ catalogo, agoraMs: () => 1 })).toEqual([]);
  });

  it('credenciaisDoEnv lê só o que está setado', () => {
    const env = { BELENUS_USER: 'a', BELENUS_PASS: 'b', SOLFACIL_USER: 'c' } as any;
    const cred = credenciaisDoEnv(env);
    expect(cred.belenus).toEqual({ email: 'a', senha: 'b' });
    expect(cred.solfacil).toBeUndefined(); // falta SOLFACIL_PASS
  });
});
