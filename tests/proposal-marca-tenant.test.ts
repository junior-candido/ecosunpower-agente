// 30/09/2026 — proposta de EMPRESA CLIENTE sai 100% com a marca dela
// (caso Conquista Solar). Antes: logo escura da EcoSun no topo/CTA/rodapé,
// "Junior Candido — Responsável Técnico", marcas da EcoSun, "45 dias",
// "Neoenergia-DF / Equatorial-GO" e prova social da EcoSun.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderProposalHTML, type ProposalData } from '../src/modules/proposal/template.js';
import { renderComoFuncionaSection } from '../src/modules/proposal/como-funciona-render.js';
import type { ProposalCalculations } from '../src/modules/proposal/calculator.js';
import { carregarEmpresaConfig, comEmpresaDe, _resetEstadoParaTeste } from '../src/modules/empresa-config.js';
import { LOGO_ECOSUNPOWER_DARK_BASE64, LOGO_ECOSUNPOWER_BRANCO_BASE64, LOGO_VAZIA, obterLogoBase64 } from '../src/modules/proposal/assets/logo-base64.js';

const TENANT = 'c1a2b3c4-0000-0000-0000-00000000aaaa';
const LOGO_TENANT = 'data:image/png;base64,iVBORw0KGgoTENANTLOGO';

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
function dadosTenant(): ProposalData {
  return {
    numeroProposta: '2026-C', dataProposta: '30/09/2026', validadeDias: 5,
    nomeCliente: 'Cliente BA', potenciaKwp: 8.4, fatorPerda: 0.78,
    tipoCliente: 'residencial', modalidade: 'autoconsumo local', concessionaria: 'Neoenergia Coelba',
    modulo: { fabricante: 'Trina', modelo: 'Vertex 700W', potenciaW: 700, quantidade: 12, garantiaDefeito: 12, garantiaEficiencia: 30 },
    inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1, garantia: 10 },
    valorTotalRs: 38500,
    formasPagamento: [{ tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 38.500', valorSecundario: 'único', bullets: ['Sem juros'] }],
    empresa: { nome: 'Conquista Solar', cnpj: '04.520.636/0001-15', cidade: 'Vitória da Conquista-BA', telefone: '(77) 99961-0038', site: 'conquistasolar.com.br' },
  };
}

beforeAll(async () => {
  _resetEstadoParaTeste();
  const rows = [{
    company_id: TENANT, razao_social: 'CONQUISTA SOLAR LTDA', nome_fantasia: 'Conquista Solar',
    cnpj: '04.520.636/0001-15', endereco: 'Rua X', cidade: 'Vitória da Conquista', uf: 'BA',
    email: 'contato@conquistasolar.com.br', site_url: 'https://conquistasolar.com.br',
    descricao_curta: 'energia solar na Bahia', regiao_atuacao: 'Vitória da Conquista e região',
    nome_atendente: 'Clara', telefone_atendente: '5577999610038',
    rt_nome: 'Conquista Solar', rt_apelido: 'nossa equipe', rt_genero: 'f', rt_titulo: 'equipe comercial',
    belenus_ativo: false, marcas_permitidas: [],
  }];
  const client = { from: () => ({ select: async () => ({ data: rows, error: null }) }) } as unknown as Parameters<typeof carregarEmpresaConfig>[0];
  await carregarEmpresaConfig(client);
});
afterAll(() => _resetEstadoParaTeste());

describe('proposta de empresa cliente — nada da EcoSun', () => {
  const render = (logo: string) => comEmpresaDe(TENANT, () => renderProposalHTML(dadosTenant(), baseCalc(), '', logo));

  it('sem logo escura, sem Junior, sem marcas/prazo/região da EcoSun', () => {
    const html = render(LOGO_TENANT);
    expect(html).not.toContain(LOGO_ECOSUNPOWER_DARK_BASE64);
    expect(html).not.toContain(LOGO_ECOSUNPOWER_BRANCO_BASE64);
    expect(html).not.toMatch(/Junior/);
    expect(html).not.toMatch(/EcoSun/i);
    expect(html).not.toMatch(/45 dias/);
    expect(html).not.toMatch(/Brasília|Goiás|Neoenergia-DF|Equatorial-GO/);
    expect(html).not.toMatch(/Trina, JA Solar, Jinko/);
  });

  it('usa a logo DA empresa nos lugares da marca', () => {
    const html = render(LOGO_TENANT);
    expect(html.split(LOGO_TENANT).length - 1).toBeGreaterThanOrEqual(3);
    expect(html).toContain('Conquista Solar');
  });

  it('empresa sem logo: escreve o nome, não põe logo de ninguém', () => {
    const html = render(LOGO_VAZIA);
    expect(html).toMatch(/class="brand-name[^"]*"[^>]*>Conquista Solar</);
    expect(html).not.toContain(LOGO_ECOSUNPOWER_DARK_BASE64);
  });

  it('"como funciona" sem distribuidora nem prazo da EcoSun', () => {
    const html = comEmpresaDe(TENANT, () => renderComoFuncionaSection());
    expect(html).not.toMatch(/Neoenergia-DF|Equatorial-GO|45 dias/);
    expect(html).toContain('Conquista Solar');
  });

  it('obterLogoBase64 de empresa sem logo cadastrada devolve a logo VAZIA (nunca a da EcoSun)', async () => {
    const logo = await comEmpresaDe(TENANT, () => obterLogoBase64({} as never));
    expect(logo).toBe(LOGO_VAZIA);
  });
});

describe('proposta de SERVIÇO de empresa cliente — nada da EcoSun', () => {
  it('sem logo, nome, garantia ou RT da EcoSun', async () => {
    const { renderServiceOnlyHTML } = await import('../src/modules/proposal/service-render.js');
    const html = comEmpresaDe(TENANT, () => renderServiceOnlyHTML({
      numeroProposta: 'S-1', dataProposta: '30/09/2026', validadeDias: 5, nomeCliente: 'Cliente BA',
      servicos: [{ descricao: 'Limpeza de módulos', valorRs: 500 } as never],
      totalRs: 500,
      formasPagamento: [{ tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 500', valorSecundario: 'único', bullets: [] }],
      empresa: { nome: 'Conquista Solar', cnpj: '04.520.636/0001-15', cidade: 'Vitória da Conquista-BA', telefone: '(77) 99961-0038', site: 'conquistasolar.com.br' },
    }));
    expect(html).not.toContain(LOGO_ECOSUNPOWER_DARK_BASE64);
    expect(html).not.toContain(LOGO_ECOSUNPOWER_BRANCO_BASE64);
    expect(html).not.toMatch(/EcoSun/i);
    expect(html).toContain('Garantia Conquista Solar');
  });
});
