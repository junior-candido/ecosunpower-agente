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

  it('passo a passo bate com o cálculo: o kWh mostrado pro Fio B é o COMPENSADO, não o injetado', () => {
    // caso real 21/07: 17 kWp gerando 2152 pra consumo 1200 — injeta 1614 mas só compensa 662.
    const calc = calcular(input({
      potenciaKwp: 17, consumoMensalKwh: 1200, geracaoMensalKwhOverride: 2152,
      tarifaRsKwh: 1.05, custoIluminacaoPublica: 35,
    }));
    const html = renderEconomiaFuncionaSection(calc, { temCarregador: false });
    // a linha do Fio B mostra os 662 compensados (cliente confere: 662×0,30×60% ≈ o R$ exibido)
    expect(html).toContain('662 kWh');
    // e os créditos aparecem no passo a passo (952 kWh guardados, 60 meses)
    expect(html).toContain('952 kWh');
    expect(html.toLowerCase()).toContain('crédito');
    expect(html).toContain('60 meses');
    // o texto antigo que apontava o Fio B pro injetado inteiro não pode sobrar
    expect(html).not.toContain('1.614 kWh');
  });

  it('autoconsumo remoto: passo a passo mostra a outra unidade em R$ e a sobra REAL', () => {
    const calc = calcular(input({
      potenciaKwp: 17, consumoMensalKwh: 1200, geracaoMensalKwhOverride: 2152,
      tarifaRsKwh: 1.05, custoIluminacaoPublica: 35, reajusteAnualEnergia: 0,
      consumoRemotoMensalKwh: 900,
    }));
    const html = renderEconomiaFuncionaSection(calc, { temCarregador: false });
    expect(html.toLowerCase()).toContain('outra unidade');
    expect(html).toContain('900 kWh');   // abatidos lá
    expect(html).toContain('783');       // economia de lá em R$
    expect(html).toContain('52 kWh');    // guardado é só o que sobra DEPOIS do remoto
    expect(html).not.toContain('952 kWh'); // o bruto não aparece mais como "sobra"
  });

  it('sistema justo (sem sobra): passo a passo igual ao de antes, sem linha de créditos', () => {
    const html = renderEconomiaFuncionaSection(calcular(input()), { temCarregador: false });
    expect(html.toLowerCase()).not.toContain('crédito');
    expect(html).toContain('375 kWh'); // injetado = compensado no sistema justo
  });

  it('carregador: mostra a dica de carregar de dia quando há carregador', () => {
    const semCarro = renderEconomiaFuncionaSection(calcular(input()), { temCarregador: false });
    const comCarro = renderEconomiaFuncionaSection(calcular(input()), { temCarregador: true });
    expect(comCarro.toLowerCase()).toContain('carreg');
    expect(comCarro.length).toBeGreaterThan(semCarro.length);
  });
});
