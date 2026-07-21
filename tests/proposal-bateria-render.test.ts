import { describe, it, expect } from 'vitest';
import { renderProposalHTML, type ProposalData } from '../src/modules/proposal/template.js';
import type { ProposalCalculations } from '../src/modules/proposal/calculator.js';

function baseCalc(): ProposalCalculations {
  return {
    geracaoMensalKwh: 1000, geracaoAnualKwh: 12000, geracaoVidaUtilKwh: 300000,
    contaSemSistemaMensal: 1000, contaComSistemaMensal: 100, economiaMensal: 900,
    economiaAnual: 10800, economiaVidaUtil: 320000,
    economiaRemotaMensal: 0, creditosUsadosRemotoKwh: 0, creditosGuardadosKwh: 0,
    paybackAnos: 4, paybackMeses: 2, paybackInviavel: false, roiVezes: 8,
    tirPercentual: 25, rsPorWp: 4.5, co2EvitadoToneladas: 25,
    geracaoMensalDistribuida: Array(12).fill(1000), consumoMensalDistribuido: Array(12).fill(720),
    fluxoCaixaAnual: [-38500, ...Array(25).fill(12000)],
    contaSemSistemaAnual: Array(25).fill(12000), contaComSistemaAnual: Array(25).fill(1200),
    contaComDetalhada: { total: 100, fioB: 80, consumoRede: 0, cip: 20, autoconsumoKwh: 250, injetadoKwh: 750, compensadaKwh: 750, creditosKwh: 0 },
    tipoSistema: 'on_grid', percentualGeracaoInjetadaUsado: 0.75,
    anoInicial: 2026, percentualFioBInicial: 0.60,
    tabelaSimultaneidade: [], tabelaFioBAnos: [],
  };
}
function baseData(): ProposalData {
  return {
    numeroProposta: '2026-T', dataProposta: '06/06/2026', validadeDias: 5,
    nomeCliente: 'Teste', potenciaKwp: 8.4, fatorPerda: 0.78,
    tipoCliente: 'residencial', modalidade: 'autoconsumo local', concessionaria: 'Neoenergia DF',
    modulo: { fabricante: 'Trina', modelo: 'Vertex 700W', potenciaW: 700, quantidade: 12, garantiaDefeito: 12, garantiaEficiencia: 30 },
    inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1, garantia: 10 },
    valorTotalRs: 38500,
    formasPagamento: [{ tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 38.500', valorSecundario: 'único', bullets: ['Sem juros'] }],
    empresa: { nome: 'EcoSunPower', cnpj: '00', cidade: 'Brasília-DF', telefone: '(61) 99697-8781', site: 'ecosunpower.eng.br' },
  };
}

describe('render — autoconsumo remoto na proposta principal', () => {
  it('hero e box verde mostram a divisão casa + outra unidade, % coerente com a conta local', () => {
    const calc: ProposalCalculations = {
      ...baseCalc(),
      contaSemSistemaMensal: 1295, contaComSistemaMensal: 154,
      economiaMensal: 1924, economiaAnual: 1924 * 12,
      economiaRemotaMensal: 783, creditosUsadosRemotoKwh: 900, creditosGuardadosKwh: 52,
    };
    const html = renderProposalHTML(baseData(), calc);
    expect(html.toLowerCase()).toContain('outra unidade');
    expect(html).toContain('R$ 1.141'); // parte desta casa (total − remoto)
    expect(html).toContain('R$ 783');   // parte da outra unidade
    expect(html).toContain('(nas duas unidades)'); // rótulo da economia 25 anos
    // o % da conta nunca pode passar de 100 nem usar o total — 1141/1295 ≈ 88%
    expect(html).not.toMatch(/1\d\d% da conta/);
  });

  it('sem remoto: proposta idêntica de sempre, sem menção a outra unidade', () => {
    const html = renderProposalHTML(baseData(), baseCalc());
    expect(html.toLowerCase()).not.toContain('outra unidade');
  });
});

describe('render — proposta híbrida (com bateria)', () => {
  it('mostra selo Híbrido, card da bateria e benefícios + autonomia', () => {
    const data = baseData();
    data.bateria = { fabricante: 'BYD', modelo: 'B-Box 10', capacidadeKwh: 10, quantidade: 1, garantia: 10 };
    const html = renderProposalHTML(data, baseCalc());
    expect(html).toMatch(/Sistema Híbrido/i);
    expect(html).toContain('BYD');
    expect(html).toContain('B-Box 10');
    expect(html).toMatch(/10(,0)? kWh/);
    expect(html).toMatch(/autonomia/i);
    expect(html).toMatch(/~9h/);
  });

  it('com 2 unidades mostra a capacidade total somada', () => {
    const data = baseData();
    data.bateria = { fabricante: 'Huawei', modelo: 'LUNA2000', capacidadeKwh: 5, quantidade: 2, garantia: 10 };
    const html = renderProposalHTML(data, baseCalc());
    expect(html).toContain('Huawei');
    expect(html).toMatch(/10(,0)? kWh/);
  });
});

describe('render — on-grid (sem bateria) fica intacto', () => {
  it('não mostra nada de híbrido/bateria', () => {
    const html = renderProposalHTML(baseData(), baseCalc());
    expect(html).not.toMatch(/Sistema Híbrido/i);
    expect(html).not.toMatch(/bateria/i);
    expect(html).not.toMatch(/autonomia/i);
  });
});

describe('render — modo comparação não mostra o selo híbrido global', () => {
  it('com bateria + modoComparacao, não pinta o selo (evita "as 2 são híbridas")', () => {
    const data = baseData();
    data.modoComparacao = true;
    data.bateria = { fabricante: 'BYD', modelo: 'B-Box 10', capacidadeKwh: 10, quantidade: 1, garantia: 10 };
    const html = renderProposalHTML(data, baseCalc());
    expect(html).not.toMatch(/Sistema Híbrido/i);
  });
});
