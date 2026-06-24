import { describe, it, expect } from 'vitest';
import { calcular, type ProposalInput } from '../src/modules/proposal/calculator.js';
import { renderEconomiaFuncionaSection } from '../src/modules/proposal/economia-funciona-render.js';

function input(over: Partial<ProposalInput> = {}): ProposalInput {
  return {
    potenciaKwp: 4, fatorPerda: 0.8, hsp: 5.4,
    consumoMensalKwh: 500, tarifaRsKwh: 1.0, reajusteAnualEnergia: 0.10,
    tusdFioBRsKwh: 0.30, percentualFioBVigente: 0.60, percentualGeracaoInjetada: 0.75,
    custoIluminacaoPublica: 0, valorTotalRs: 20000, vidaUtilAnos: 25,
    geracaoMensalKwhOverride: 500, anoInicial: 2026, tipoSistema: 'on_grid',
    ...over,
  };
}

describe('renderEconomiaFuncionaSection', () => {
  it('on-grid: explica o Fio B com os números do cliente + as 2 tabelinhas', () => {
    const html = renderEconomiaFuncionaSection(calcular(input()), { temCarregador: false });
    // valor do Fio B do mês (R$ 67,50)
    expect(html).toContain('67,50');
    // os dois eixos: autoconsumo (de dia) e injeção (vai pra rede)
    expect(html.toLowerCase()).toContain('autoconsumo');
    // tabela do Fio B por ano deve citar 2029 (100%)
    expect(html).toContain('2029');
    // tabela de simultaneidade
    expect(html.toLowerCase()).toContain('simultaneidade');
  });

  it('off-grid: mostra "sai da conta de luz" e NÃO renderiza tabela de Fio B', () => {
    const html = renderEconomiaFuncionaSection(
      calcular(input({ tipoSistema: 'off_grid' })),
      { temCarregador: false },
    );
    expect(html.toLowerCase()).toContain('conta de luz');
    expect(html).not.toContain('Fio B 60%'); // sem rampa de Fio B
  });

  it('carregador: mostra a dica de carregar de dia quando há carregador', () => {
    const semCarro = renderEconomiaFuncionaSection(calcular(input()), { temCarregador: false });
    const comCarro = renderEconomiaFuncionaSection(calcular(input()), { temCarregador: true });
    expect(comCarro.toLowerCase()).toContain('carreg');
    expect(comCarro.length).toBeGreaterThan(semCarro.length);
  });
});
