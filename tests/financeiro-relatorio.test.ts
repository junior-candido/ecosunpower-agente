import { describe, it, expect } from 'vitest';
import { parseRelatorioComando } from '../src/modules/financeiro/comando-relatorio.js';
import { montarRelatorioMensal, nomeMesAno, type RelatorioMensal } from '../src/modules/financeiro/relatorio-mensal.js';

const HOJE = '2026-06';

// ──────────────────────────────────────────────────────────
// Task 1: parseRelatorioComando
// ──────────────────────────────────────────────────────────
describe('parseRelatorioComando', () => {
  it('retorna null para texto que não é relatório', () => {
    expect(parseRelatorioComando('proposta', HOJE)).toBeNull();
    expect(parseRelatorioComando('oi', HOJE)).toBeNull();
    expect(parseRelatorioComando('', HOJE)).toBeNull();
  });

  it('"relatório" sem período → mês atual', () => {
    expect(parseRelatorioComando('relatório', HOJE)).toEqual({ competencia: '2026-06' });
    expect(parseRelatorioComando('relatorio', HOJE)).toEqual({ competencia: '2026-06' });
    expect(parseRelatorioComando('/relatório', HOJE)).toEqual({ competencia: '2026-06' });
    expect(parseRelatorioComando('/relatorio', HOJE)).toEqual({ competencia: '2026-06' });
  });

  it('"relatório de maio" → 2026-05', () => {
    expect(parseRelatorioComando('relatório de maio', HOJE)).toEqual({ competencia: '2026-05' });
    expect(parseRelatorioComando('relatorio de maio', HOJE)).toEqual({ competencia: '2026-05' });
  });

  it('"relatório maio" (sem "de") → 2026-05', () => {
    expect(parseRelatorioComando('relatório maio', HOJE)).toEqual({ competencia: '2026-05' });
  });

  it('"relatório de mai" (abreviação) → 2026-05', () => {
    expect(parseRelatorioComando('relatório de mai', HOJE)).toEqual({ competencia: '2026-05' });
  });

  it('"relatório 05" → 2026-05', () => {
    expect(parseRelatorioComando('relatório 05', HOJE)).toEqual({ competencia: '2026-05' });
    expect(parseRelatorioComando('relatório 5', HOJE)).toEqual({ competencia: '2026-05' });
  });

  it('"relatório de 05" → 2026-05', () => {
    expect(parseRelatorioComando('relatório de 05', HOJE)).toEqual({ competencia: '2026-05' });
  });

  it('mês futuro no mesmo ano → ano anterior', () => {
    // HOJE = 2026-06, mês 07 ainda não chegou → 2025-07
    expect(parseRelatorioComando('relatório 07', HOJE)).toEqual({ competencia: '2025-07' });
    expect(parseRelatorioComando('relatório de julho', HOJE)).toEqual({ competencia: '2025-07' });
  });

  it('"relatório 06" com HOJE=2026-06 → mês atual (não vai para o passado)', () => {
    // mês 06 == mesAtual, então ano corrente
    expect(parseRelatorioComando('relatório 06', HOJE)).toEqual({ competencia: '2026-06' });
  });

  it('formato ISO completo "relatório 2025-12" → 2025-12', () => {
    expect(parseRelatorioComando('relatório 2025-12', HOJE)).toEqual({ competencia: '2025-12' });
    expect(parseRelatorioComando('relatório de 2025-12', HOJE)).toEqual({ competencia: '2025-12' });
  });

  it('case insensitive e espaços extras nas bordas', () => {
    expect(parseRelatorioComando('  RELATÓRIO DE MAIO  ', HOJE)).toEqual({ competencia: '2026-05' });
  });

  it('texto irreconhecível após "relatório" cai no mês atual', () => {
    expect(parseRelatorioComando('relatório blablabla', HOJE)).toEqual({ competencia: '2026-06' });
  });
});

// ──────────────────────────────────────────────────────────
// Task 2: montarRelatorioMensal + nomeMesAno
// ──────────────────────────────────────────────────────────
const base: RelatorioMensal = {
  competencia: '2026-05',
  faturadoMesPj: 30000,
  entrouSemNotaPj: 5000,
  entrouMesPjCaixa: 35000,
  saiuMesPj: 12000,
  lucroMes: 20800,
  impostoMes: 2200,
  rbt12: 300000,
  faixa: 2,
  anexoFatorR: 'III',
  aReceber: 8000,
  entrouMesPf: 1500,
  saiuMesPf: 900,
  pizzaCategorias: [
    { categoria: 'Fornecedores', total: 7000 },
    { categoria: 'Aluguel', total: 3000 },
    { categoria: 'Marketing', total: 2000 },
  ],
};

describe('nomeMesAno', () => {
  it('formata competência corretamente', () => {
    expect(nomeMesAno('2026-05')).toBe('Maio/2026');
    expect(nomeMesAno('2026-01')).toBe('Janeiro/2026');
    expect(nomeMesAno('2026-12')).toBe('Dezembro/2026');
  });
});

describe('montarRelatorioMensal', () => {
  it('contém o cabeçalho com mês e ano', () => {
    const texto = montarRelatorioMensal(base);
    expect(texto).toContain('Maio/2026');
    expect(texto).toContain('Relatório');
  });

  it('contém valores monetários corretos', () => {
    const texto = montarRelatorioMensal(base);
    // Entrou caixa real
    expect(texto).toContain('35.000');
    // Faturado com nota
    expect(texto).toContain('30.000');
    // Saiu
    expect(texto).toContain('12.000');
    // Lucro
    expect(texto).toContain('20.800');
    // Imposto
    expect(texto).toContain('2.200');
    // A receber
    expect(texto).toContain('8.000');
  });

  it('mostra "por fora" quando entrouSemNotaPj > 0', () => {
    const texto = montarRelatorioMensal(base);
    expect(texto).toContain('Por fora');
    expect(texto).toContain('5.000');
  });

  it('NÃO mostra "por fora" quando entrouSemNotaPj = 0', () => {
    const semNota: RelatorioMensal = { ...base, entrouSemNotaPj: 0 };
    const texto = montarRelatorioMensal(semNota);
    expect(texto).not.toContain('Por fora');
  });

  it('mostra faixa e anexo do fator R', () => {
    const texto = montarRelatorioMensal(base);
    expect(texto).toContain('faixa 2');
    expect(texto).toContain('Anexo III');
  });

  it('mostra top categorias de despesa', () => {
    const texto = montarRelatorioMensal(base);
    expect(texto).toContain('Fornecedores');
    expect(texto).toContain('Aluguel');
    expect(texto).toContain('Marketing');
  });

  it('mostra mundo PF com entrou e saiu', () => {
    const texto = montarRelatorioMensal(base);
    expect(texto).toContain('Mundo PF');
    expect(texto).toContain('1.500');
    expect(texto).toContain('900');
  });

  it('contém o link para o dashboard', () => {
    const texto = montarRelatorioMensal(base);
    expect(texto).toContain('dashboard.ecosunpower.eng.br/dashboard/financeiro');
  });

  it('limita pizza a 5 categorias no máximo', () => {
    const muitasCategorias: RelatorioMensal = {
      ...base,
      pizzaCategorias: [
        { categoria: 'Cat1', total: 100 },
        { categoria: 'Cat2', total: 90 },
        { categoria: 'Cat3', total: 80 },
        { categoria: 'Cat4', total: 70 },
        { categoria: 'Cat5', total: 60 },
        { categoria: 'Cat6', total: 50 }, // deve ser omitida
      ],
    };
    const texto = montarRelatorioMensal(muitasCategorias);
    expect(texto).toContain('Cat5');
    expect(texto).not.toContain('Cat6');
  });
});
