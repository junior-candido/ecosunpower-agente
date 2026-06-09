// tests/proposal-comparacao-layout.test.ts
// Modo comparação: a proposta INTEIRA tem de ser de comparação — não pode misturar
// seções de "1 sistema só" (topo com kWp/geração, resumo executivo, equipamento,
// pagamento de uma opção) com o quadro comparativo. Senão o cliente fica confuso.
// Pedido do Junior 09/06/2026.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProposalAssistant } from '../src/modules/proposal-assistant.js';

vi.mock('../src/modules/proposal/pdf-generator.js', () => ({
  htmlToPdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  gerarQrCodeDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
}));
vi.mock('../src/modules/cases-fetcher.js', () => ({
  CasesFetcher: vi.fn().mockImplementation(function () {
    return { getByTipo: vi.fn().mockResolvedValue([]) };
  }),
}));

const fakeSupabase = (): any => ({
  savePropostaPublica: vi.fn().mockResolvedValue({ id: 'fake-id', expiresAt: '2026-12-31' }),
  updatePropostaPublicaHtml: vi.fn().mockResolvedValue(undefined),
  getClient: vi.fn().mockReturnValue({}),
});

function baseData(extra: Record<string, unknown> = {}) {
  return {
    nomeCliente: 'Teste', telefoneCliente: '5561999999999',
    potenciaKwp: 8.4, fatorPerda: 0.8, consumoMensalKwh: 1000,
    tarifaRsKwh: 1.05, custoDisponibilidadeMensal: 50,
    tipoCliente: 'residencial', modalidade: 'autoconsumo local', concessionaria: 'Neoenergia DF',
    modulo: { fabricante: 'Trina', modelo: 'Vertex 700W', potenciaW: 700, quantidade: 12, garantiaDefeito: 12, garantiaEficiencia: 30, tecnologia: 'TOPCon' },
    inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1, garantia: 10, eficiencia: 0.985, tipoInversor: 'string' },
    estruturaFixacao: { tipo: 'Telha cerâmica', material: 'Alumínio anodizado', descricao: 'Ganchos' },
    valorTotalRs: 38500,
    ...extra,
  };
}

const comparacao = [
  { rotulo: 'Opção A', potenciaKwp: 8.4, valorTotalRs: 38500, modulo: { fabricante: 'Trina', modelo: 'Vertex', potenciaW: 700, quantidade: 12 }, inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', quantidade: 1 } },
  { rotulo: 'Opção B', potenciaKwp: 10.5, valorTotalRs: 48000, modulo: { fabricante: 'LONGi', modelo: 'Hi-MO X10', potenciaW: 580, quantidade: 18 }, inversor: { fabricante: 'SolarEdge', modelo: 'SE7K', quantidade: 1 } },
];

describe('Layout do modo comparação', () => {
  let pa: ProposalAssistant;
  let supabase: any;

  beforeEach(() => {
    vi.stubEnv('HIGGSFIELD_CREDENTIALS', '');
    supabase = fakeSupabase();
    pa = new ProposalAssistant({
      apiKey: 'fake', redisHost: 'localhost', redisPort: 6379, redisPassword: undefined,
      knowledgeBaseDir: './conhecimento', driveUploader: null, engineerPhone: '5561111',
      supabaseService: supabase, publicProposalBaseUrl: 'https://propostas.test',
    });
  });

  async function gerarHtml(extra: Record<string, unknown> = {}): Promise<string> {
    await pa.generateProposalCore({ data: baseData(extra), modoEnvio: 'junior_envia', tipo: 'basica' });
    return supabase.savePropostaPublica.mock.calls[0][0].htmlContent;
  }

  it('comparação ESCONDE as seções de um sistema só (topo, resumo, equipamento, pagamento)', async () => {
    const html = await gerarHtml({ comparacao });
    // Quadro comparativo presente
    expect(html).toContain('Compare as opções');
    // Topo NÃO mostra stat de um sistema
    expect(html).not.toContain('kWh/mês estimados');
    expect(html).not.toContain('kWp instalados');
    // Resumo executivo de um sistema escondido
    expect(html).not.toContain('O que esse sistema faz pra você');
    // Seção de equipamento de um sistema escondida
    expect(html).not.toContain('O que vai no seu telhado');
    // Seção de pagamento de UMA opção escondida (parcela vai dentro do quadro)
    expect(html).not.toContain('Como você prefere investir?');
    // A parcela do cartão aparece por opção no quadro
    expect(html.toLowerCase()).toContain('cartão');
  });

  it('mostra a parcela do cartão de CADA opção, com valores DIFERENTES (A ≠ B)', async () => {
    const html = await gerarHtml({ comparacao });
    // Opção A = R$ 38.500 e Opção B = R$ 48.000 → parcelas de cartão diferentes
    expect(html).toContain('no cartão');
    expect(html).toContain('financiado');
    // duas parcelas de cartão distintas (uma por opção)
    const parcelas = [...html.matchAll(/24× de <strong[^>]*>R\$ ([\d.]+)<\/strong> no cartão/g)].map(m => m[1]);
    expect(parcelas).toHaveLength(2);
    expect(parcelas[0]).not.toBe(parcelas[1]);
  });

  it('comparação + serviços: a seção de serviços NÃO entra (total travaria na Opção A)', async () => {
    const html = await gerarHtml({
      comparacao,
      servicos: [{ titulo: 'Carregador EV', descricao: 'Wallbox', valorRs: 4500, jaIncluso: false }],
    });
    expect(html).toContain('Compare as opções');
    expect(html).not.toContain('Carregador EV');
    expect(html.toLowerCase()).not.toContain('total da proposta');
  });

  it('proposta de UM sistema MANTÉM todas as seções normais', async () => {
    const html = await gerarHtml(); // sem comparacao
    expect(html).not.toContain('Compare as opções');
    expect(html).toContain('kWh/mês estimados');
    expect(html).toContain('O que esse sistema faz pra você');
    expect(html).toContain('O que vai no seu telhado');
    expect(html).toContain('Como você prefere investir?');
  });
});
