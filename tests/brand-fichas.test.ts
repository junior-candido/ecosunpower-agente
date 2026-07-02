import { describe, it, expect } from 'vitest';
import { getBrandFicha } from '../src/modules/proposal/brand-fichas.js';
import { renderProposalHTML, type ProposalData } from '../src/modules/proposal/template.js';
import type { ProposalCalculations } from '../src/modules/proposal/calculator.js';

describe('getBrandFicha', () => {
  it('acha a ficha de um módulo por marca (case-insensitive)', () => {
    const f = getBrandFicha('trina', 'modulo');
    expect(f).not.toBeNull();
    expect(f!.tier1).toBe(true);
    expect(f!.tecnologia).toMatch(/TOPCon|N-Type/i);
    expect(f!.resumo.length).toBeGreaterThan(20);
  });
  it('acha por marca composta ("JA Solar")', () => {
    expect(getBrandFicha('JA Solar', 'modulo')).not.toBeNull();
  });
  it('acha inversor por marca', () => {
    const f = getBrandFicha('Sungrow', 'inversor');
    expect(f).not.toBeNull();
  });
  it('retorna null pra marca desconhecida', () => {
    expect(getBrandFicha('MarcaInexistente', 'modulo')).toBeNull();
  });
  it('não confunde tipos (Trina não é inversor)', () => {
    expect(getBrandFicha('Trina', 'inversor')).toBeNull();
  });
  it('NÃO casa prefixo parcial que não é palavra inteira (Sol não vira Solis)', () => {
    expect(getBrandFicha('Sol', 'inversor')).toBeNull();
    expect(getBrandFicha('Sola', 'inversor')).toBeNull();
  });
  it('casa abreviação de palavra inteira (JA -> JA Solar)', () => {
    expect(getBrandFicha('JA', 'modulo')).not.toBeNull();
  });
});

function baseCalc(): ProposalCalculations {
  return {
    geracaoMensalKwh: 1000, geracaoAnualKwh: 12000, geracaoVidaUtilKwh: 300000,
    contaSemSistemaMensal: 1000, contaComSistemaMensal: 100, economiaMensal: 900,
    economiaAnual: 10800, economiaVidaUtil: 320000,
    paybackAnos: 4, paybackMeses: 2, paybackInviavel: false, roiVezes: 8,
    tirPercentual: 25, rsPorWp: 4.5, co2EvitadoToneladas: 25,
    geracaoMensalDistribuida: Array(12).fill(1000), consumoMensalDistribuido: Array(12).fill(1000),
    fluxoCaixaAnual: [-38500, ...Array(25).fill(12000)],
    contaSemSistemaAnual: Array(25).fill(12000), contaComSistemaAnual: Array(25).fill(1200),
    contaComDetalhada: { total: 100, fioB: 80, consumoRede: 0, cip: 20, autoconsumoKwh: 250, injetadoKwh: 750 },
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

describe('ficha de marca na proposta renderizada', () => {
  it('mostra o resumo da marca do módulo (Trina) e do inversor (Sungrow)', () => {
    const html = renderProposalHTML(baseData(), baseCalc());
    expect(html).toContain('Trina Solar');
    expect(html).toContain('Sungrow');
    expect(html).toMatch(/Tier 1|N-Type|TOPCon/);
  });
  it('respeita o fichaOverride do Junior', () => {
    const data = baseData();
    data.modulo.fichaOverride = 'MINHA FICHA CUSTOMIZADA DO MODULO';
    const html = renderProposalHTML(data, baseCalc());
    expect(html).toContain('MINHA FICHA CUSTOMIZADA DO MODULO');
  });
  it('NÃO renderiza ficha pra marca fora da lista', () => {
    const data = baseData();
    data.modulo.fabricante = 'MarcaDesconhecida';
    data.inversor.fabricante = 'OutraMarcaX';
    const html = renderProposalHTML(data, baseCalc());
    // nenhum resumo de ficha conhecida deve aparecer
    expect(html).not.toContain('Top 3 mundial');
    expect(html).not.toContain('eficiência acima de 99%');
  });
  it('respeita o fichaOverride do inversor', () => {
    const data = baseData();
    data.inversor.fichaOverride = 'FICHA CUSTOM DO INVERSOR XYZ';
    const html = renderProposalHTML(data, baseCalc());
    expect(html).toContain('FICHA CUSTOM DO INVERSOR XYZ');
  });
  it('celular: halo da logo do hero reduzido; desktop intacto', () => {
    const html = renderProposalHTML(baseData(), baseCalc());
    expect(html).toContain('drop-shadow(0 0 9px rgba(102,207,243,.75))'); // desktop como sempre
    expect(html).toContain('drop-shadow(0 0 5px rgba(102,207,243,.45))'); // mobile: metade
  });
});
