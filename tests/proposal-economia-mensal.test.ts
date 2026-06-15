// tests/proposal-economia-mensal.test.ts
// A economia mensal em R$ ("quanto o cliente deixa de pagar por mês") tem de aparecer
// EM DESTAQUE na proposta solar (topo/hero + bloco grande na análise financeira) —
// não escondida num item miúdo. Pedido do Junior em 09/06/2026.
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
  updatePropostaPublica: vi.fn().mockResolvedValue(undefined),
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

describe('Economia mensal em R$ em destaque (proposta solar)', () => {
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

  it('renderiza o bloco de destaque + hero, com o MESMO valor R$/mês nos dois', async () => {
    await pa.generateProposalCore({ data: baseData(), modoEnvio: 'junior_envia', tipo: 'basica' });
    const html: string = supabase.savePropostaPublica.mock.calls[0][0].htmlContent;
    // Bloco grande (string única) + reforço anual do caminho sem serviços
    expect(html).toContain('Você deixa de pagar todo mês');
    expect(html).toContain('que voltam pro seu orçamento');
    // Hero passou a mostrar R$/mês (string única do hero)
    expect(html).toContain('por mês · ~');
    // Consistência: o R$/mês do hero é o MESMO do bloco grande (pega economiaMensal, não 25 anos)
    const hero = html.match(/Economia<\/div>\s*<div class="hero-stat-value">R\$ ([\d.]+)<\/div>/);
    const bloco = html.match(/Você deixa de pagar todo mês<\/div>\s*<div[^>]*>R\$ ([\d.]+)/);
    expect(hero?.[1]).toBeTruthy();
    expect(bloco?.[1]).toBe(hero?.[1]);
  });

  it('com serviços: o texto NÃO promete "voltam pro orçamento" (economia é só do solar)', async () => {
    await pa.generateProposalCore({
      data: baseData({ servicos: [{ titulo: 'Carregador EV', descricao: 'Wallbox', valorRs: 4500, jaIncluso: false }] }),
      modoEnvio: 'junior_envia', tipo: 'basica',
    });
    const html: string = supabase.savePropostaPublica.mock.calls[0][0].htmlContent;
    expect(html).toContain('Você deixa de pagar todo mês');
    expect(html).toContain('Economia gerada pelo sistema solar');
    expect(html).not.toContain('que voltam pro seu orçamento');
    expect(html).toContain('contratados à parte');
  });

  it('comparação de 2 sistemas: o bloco grande some (cada opção tem a sua economia mensal)', async () => {
    await pa.generateProposalCore({
      data: baseData({
        comparacao: [
          { rotulo: 'Opção A', potenciaKwp: 8.4, valorTotalRs: 38500, modulo: { fabricante: 'Trina', modelo: 'Vertex', potenciaW: 700, quantidade: 12 }, inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', quantidade: 1 } },
          { rotulo: 'Opção B', potenciaKwp: 10.5, valorTotalRs: 48000, modulo: { fabricante: 'LONGi', modelo: 'Hi-MO X10', potenciaW: 580, quantidade: 18 }, inversor: { fabricante: 'SolarEdge', modelo: 'SE7K', quantidade: 1 } },
        ],
      }),
      modoEnvio: 'junior_envia', tipo: 'basica',
    });
    const html: string = supabase.savePropostaPublica.mock.calls[0][0].htmlContent;
    expect(html).not.toContain('Você deixa de pagar todo mês'); // bloco grande escondido
    expect(html).toContain('Compare as opções'); // quadro comparativo presente
  });
});
