import { describe, it, expect } from 'vitest';
import { tempoMedioFechamento } from '../src/modules/bi-tempo-fechamento.js';

const DIA = 24 * 60 * 60 * 1000;

describe('tempoMedioFechamento', () => {
  it('retorna 0 para lista vazia', () => {
    expect(tempoMedioFechamento([])).toBe(0);
  });

  it('retorna 0 quando nenhum lead tem status ganho', () => {
    const leads = [
      { status: 'perdido', criadoEm: new Date(0), ganhoEm: null },
      { status: 'qualificando', criadoEm: new Date(0), ganhoEm: null },
    ];
    expect(tempoMedioFechamento(leads)).toBe(0);
  });

  it('calcula corretamente com um único lead ganho', () => {
    const leads = [
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: new Date(10 * DIA) },
    ];
    expect(tempoMedioFechamento(leads)).toBe(10);
  });

  it('calcula média de múltiplos leads ganhos', () => {
    const leads = [
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: new Date(10 * DIA) },
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: new Date(20 * DIA) },
      { status: 'perdido', criadoEm: new Date(0), ganhoEm: null },
    ];
    // só os ganhos: 10 e 20 dias -> média 15
    expect(tempoMedioFechamento(leads)).toBe(15);
  });

  it('ignora leads ganhos sem ganhoEm preenchido', () => {
    const leads = [
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: new Date(6 * DIA) },
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: null },
    ];
    // só o que tem ganhoEm válido conta: 6 dias
    expect(tempoMedioFechamento(leads)).toBe(6);
  });

  it('arredonda para 1 casa decimal', () => {
    const leads = [
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: new Date(1 * DIA) },
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: new Date(2 * DIA) },
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: new Date(3 * DIA) },
    ];
    // média = 2.0 dias
    expect(tempoMedioFechamento(leads)).toBe(2);
  });

  it('retorna 0 quando todos os ganhos estão sem ganhoEm', () => {
    const leads = [
      { status: 'ganho', criadoEm: new Date(0), ganhoEm: null },
    ];
    expect(tempoMedioFechamento(leads)).toBe(0);
  });
});
