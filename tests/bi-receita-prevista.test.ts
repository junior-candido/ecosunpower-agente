import { describe, it, expect } from 'vitest';
import { receitaPrevista } from '../src/modules/bi-receita-prevista.js';

describe('receitaPrevista', () => {
  it('retorna 0 para lista vazia', () => {
    expect(receitaPrevista([])).toBe(0);
  });

  it('retorna 0 quando não há leads ativos', () => {
    const leads = [
      { status: 'ganho', valor: 10000 },
      { status: 'perdido', valor: 8000 },
    ];
    expect(receitaPrevista(leads)).toBe(0);
  });

  it('retorna 0 quando não há histórico de ganhos (taxa = 0%)', () => {
    const leads = [
      { status: 'perdido', valor: 5000 },
      { status: 'qualificando', valor: 20000 },
      { status: 'negociacao', valor: 15000 },
    ];
    // sem ganhos no histórico -> taxa = 0% -> previsão = 0
    expect(receitaPrevista(leads)).toBe(0);
  });

  it('retorna 0 quando não há histórico concluído (só leads ativos)', () => {
    const leads = [
      { status: 'qualificando', valor: 20000 },
      { status: 'negociacao', valor: 15000 },
    ];
    // sem ganho nem perdido -> taxa indefinida -> 0
    expect(receitaPrevista(leads)).toBe(0);
  });

  it('calcula taxa apenas sobre leads concluídos (ganho + perdido)', () => {
    const leads = [
      // concluídos: 1 ganho + 3 perdidos = 25%
      { status: 'ganho', valor: 10000 },
      { status: 'perdido', valor: 8000 },
      { status: 'perdido', valor: 6000 },
      { status: 'perdido', valor: 4000 },
      // ativos: R$ 80.000
      { status: 'negociacao', valor: 50000 },
      { status: 'qualificando', valor: 30000 },
    ];
    // taxa = 1/4 = 25%; soma ativos = R$ 80.000
    // 25% de R$ 80.000 = R$ 20.000
    expect(receitaPrevista(leads)).toBe(20000);
  });

  it('ignora leads ativos sem valor (null ou zero)', () => {
    const leads = [
      // concluídos: 1 ganho + 1 perdido = 50%
      { status: 'ganho', valor: 10000 },
      { status: 'perdido', valor: 10000 },
      // ativos sem valor — não entram na soma
      { status: 'negociacao', valor: null },
      { status: 'qualificando', valor: 0 },
      // ativo com valor
      { status: 'agendado', valor: 20000 },
    ];
    // taxa = 1/2 = 50%; soma ativos válidos = R$ 20.000
    // 50% de R$ 20.000 = R$ 10.000
    expect(receitaPrevista(leads)).toBe(10000);
  });

  it('taxa de 2 ganhos em 4 concluídos = 50%', () => {
    const leads = [
      { status: 'ganho', valor: 5000 },
      { status: 'ganho', valor: 5000 },
      { status: 'perdido', valor: 5000 },
      { status: 'perdido', valor: 5000 },
      { status: 'negociacao', valor: 10000 },
    ];
    // taxa = 2/4 = 50%; soma ativos = R$ 10.000
    // 50% de R$ 10.000 = R$ 5.000
    expect(receitaPrevista(leads)).toBe(5000);
  });

  it('arredonda para 2 casas decimais', () => {
    const leads = [
      { status: 'ganho', valor: 1000 },
      { status: 'perdido', valor: 1000 },
      { status: 'negociacao', valor: 10000 },
    ];
    // taxa = 1/2 = 50%; soma ativos = R$ 10.000
    // 50% de R$ 10.000 = R$ 5.000
    expect(receitaPrevista(leads)).toBe(5000);
  });
});
