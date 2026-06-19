import { describe, it, expect } from 'vitest';
import { renderProposalHTML, type ProposalData } from '../src/modules/proposal/template.js';
import type { ProposalCalculations } from '../src/modules/proposal/calculator.js';

function baseCalc(): ProposalCalculations {
  return {
    geracaoMensalKwh: 1000, geracaoAnualKwh: 12000, geracaoVidaUtilKwh: 300000,
    contaSemSistemaMensal: 1000, contaComSistemaMensal: 100, economiaMensal: 900,
    economiaAnual: 10800, economiaVidaUtil: 320000,
    paybackAnos: 4, paybackMeses: 2, paybackInviavel: false, roiVezes: 8,
    tirPercentual: 25, rsPorWp: 4.5, co2EvitadoToneladas: 25,
    geracaoMensalDistribuida: Array(12).fill(1000), consumoMensalDistribuido: Array(12).fill(720),
    fluxoCaixaAnual: [-38500, ...Array(25).fill(12000)],
    contaSemSistemaAnual: Array(25).fill(12000), contaComSistemaAnual: Array(25).fill(1200),
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
