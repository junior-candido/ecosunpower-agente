import { describe, it, expect } from 'vitest';
import {
  taxaConversao,
  ticketMedio,
  distribuicaoPorEtapa,
} from '../src/modules/metricas-vendas.js';

describe('taxaConversao', () => {
  it('retorna 0 para lista vazia', () => {
    expect(taxaConversao([])).toBe(0);
  });

  it('retorna 0 quando nenhum lead é ganho', () => {
    const leads = [{ status: 'novo' }, { status: 'qualificando' }, { status: 'perdido' }];
    expect(taxaConversao(leads)).toBe(0);
  });

  it('retorna 100 quando todos os leads são ganho', () => {
    const leads = [{ status: 'ganho' }, { status: 'ganho' }];
    expect(taxaConversao(leads)).toBe(100);
  });

  it('calcula percentual correto com leads mistos', () => {
    const leads = [
      { status: 'ganho' },
      { status: 'ganho' },
      { status: 'perdido' },
      { status: 'qualificando' },
    ];
    expect(taxaConversao(leads)).toBe(50);
  });

  it('inclui leads perdidos no total (não exclui do denominador)', () => {
    const leads = [{ status: 'ganho' }, { status: 'perdido' }];
    expect(taxaConversao(leads)).toBe(50);
  });
});

describe('ticketMedio', () => {
  it('retorna 0 para lista vazia', () => {
    expect(ticketMedio([])).toBe(0);
  });

  it('calcula média corretamente', () => {
    expect(ticketMedio([1000, 2000, 3000])).toBe(2000);
  });

  it('ignora valores <= 0', () => {
    expect(ticketMedio([0, 1000, 0, 3000])).toBe(2000);
  });

  it('retorna 0 quando todos os valores são zero', () => {
    expect(ticketMedio([0, 0, 0])).toBe(0);
  });

  it('funciona com um único valor positivo', () => {
    expect(ticketMedio([5000])).toBe(5000);
  });
});

describe('distribuicaoPorEtapa', () => {
  it('retorna objeto vazio para lista vazia', () => {
    expect(distribuicaoPorEtapa([])).toEqual({});
  });

  it('conta corretamente cada etapa', () => {
    const leads = [
      { status: 'novo' },
      { status: 'novo' },
      { status: 'qualificado' },
      { status: 'ganho' },
    ];
    const dist = distribuicaoPorEtapa(leads);
    expect(dist['novo']).toBe(2);
    expect(dist['qualificado']).toBe(1);
    expect(dist['ganho']).toBe(1);
  });

  it('inclui perdido na contagem', () => {
    const leads = [{ status: 'perdido' }, { status: 'perdido' }, { status: 'novo' }];
    const dist = distribuicaoPorEtapa(leads);
    expect(dist['perdido']).toBe(2);
    expect(dist['novo']).toBe(1);
  });

  it('não inclui etapas com zero leads', () => {
    const leads = [{ status: 'novo' }];
    const dist = distribuicaoPorEtapa(leads);
    expect(dist['qualificado']).toBeUndefined();
  });
});
