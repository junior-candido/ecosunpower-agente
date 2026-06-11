// tests/financeiro-caixa-kpis.test.ts
import { describe, it, expect } from 'vitest';
import { calcularKpisCaixa } from '../src/modules/dashboard/caixa-kpis.js';

const lanc = (tipo: 'despesa' | 'entrada', valor: number, pf_pj: 'PF' | 'PJ', categoriaNome = 'Outros') =>
  ({ tipo, valor, pf_pj, categoriaNome });

describe('dashboard/caixa-kpis', () => {
  it('lucro do mês = recebido PJ − saiu PJ − imposto', () => {
    const k = calcularKpisCaixa({
      recebidoMesPj: 10000, impostoMes: 850,
      lancamentosMes: [lanc('despesa', 2000, 'PJ'), lanc('despesa', 500, 'PF')],
    });
    expect(k.saiuMesPj).toBe(2000);
    expect(k.lucroMes).toBe(7150); // 10000 - 2000 - 850 (PF fora)
  });
  it('mundo PF separado: entrou e saiu PF não tocam o lucro', () => {
    const k = calcularKpisCaixa({
      recebidoMesPj: 0, impostoMes: 0,
      lancamentosMes: [lanc('entrada', 8300, 'PF'), lanc('despesa', 1200, 'PF')],
    });
    expect(k.entrouMesPf).toBe(8300);
    expect(k.saiuMesPf).toBe(1200);
    expect(k.lucroMes).toBe(0);
  });
  it('pizza por categoria só com despesas PJ', () => {
    const k = calcularKpisCaixa({
      recebidoMesPj: 0, impostoMes: 0,
      lancamentosMes: [
        lanc('despesa', 300, 'PJ', 'Combustível'), lanc('despesa', 200, 'PJ', 'Combustível'),
        lanc('despesa', 100, 'PJ', 'Alimentação'), lanc('despesa', 999, 'PF', 'Alimentação'),
        lanc('entrada', 5000, 'PJ', 'Outros'),
      ],
    });
    expect(k.pizzaCategorias).toEqual([
      { categoria: 'Combustível', total: 500 },
      { categoria: 'Alimentação', total: 100 },
    ]);
  });
  it('entrada avulsa PJ confirmada NÃO soma de novo no recebido (vem do motor da Fatia 2)', () => {
    // entradas PJ aparecem na lista mas o "entrou" oficial é recebidoMesPj
    const k = calcularKpisCaixa({
      recebidoMesPj: 5000, impostoMes: 0,
      lancamentosMes: [lanc('entrada', 5000, 'PJ')],
    });
    expect(k.lucroMes).toBe(5000); // não vira 10000
  });
});
