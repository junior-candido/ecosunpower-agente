// tests/cartao-belenus.test.ts
// O cartão do solar usa a tabela Belenus exata (24x = +21,05% sobre o à vista),
// e o valor é FORÇADO mesmo quando a Eva monta formasPagamento à mão.
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
    nomeCliente: 'Teste',
    telefoneCliente: '5561999999999',
    potenciaKwp: 8.4,
    fatorPerda: 0.8,
    consumoMensalKwh: 1000,
    tarifaRsKwh: 1.05,
    custoDisponibilidadeMensal: 50,
    tipoCliente: 'residencial',
    modalidade: 'autoconsumo local',
    concessionaria: 'Neoenergia DF',
    modulo: { fabricante: 'Trina', modelo: 'Vertex 700W', potenciaW: 700, quantidade: 12, garantiaDefeito: 12, garantiaEficiencia: 30, tecnologia: 'TOPCon' },
    inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1, garantia: 10, eficiencia: 0.985, tipoInversor: 'string' },
    estruturaFixacao: { tipo: 'Telha cerâmica', material: 'Alumínio anodizado', descricao: 'Ganchos' },
    valorTotalRs: 10000,
    ...extra,
  };
}

describe('Cartão Belenus no solar', () => {
  let pa: ProposalAssistant;
  let supabase: any;

  beforeEach(() => {
    vi.stubEnv('HIGGSFIELD_CREDENTIALS', '');
    supabase = fakeSupabase();
    pa = new ProposalAssistant({
      apiKey: 'fake',
      redisHost: 'localhost', redisPort: 6379, redisPassword: undefined,
      knowledgeBaseDir: './conhecimento',
      driveUploader: null,
      engineerPhone: '5561111',
      supabaseService: supabase,
      publicProposalBaseUrl: 'https://propostas.test',
    });
  });

  it('default: 24x exato da tabela Belenus (R$ 10.000 → R$ 504) + bandeiras', async () => {
    const r = await pa.generateProposalCore({ data: baseData(), modoEnvio: 'junior_envia', tipo: 'basica' });
    const cartao = r.proposalData.formasPagamento.find((f: any) => f.meioPagamento === 'cartao');
    expect(cartao).toBeTruthy();
    expect(cartao.valorPrincipal).toBe('R$ 504');
    expect(cartao.bullets.join(' ')).toMatch(/Visa\/Amex.*24.*Master\/Elo.*21.*12/i);
  });

  it('override: mesmo se a Eva mandar valor de cartão errado, o sistema força o exato', async () => {
    const formasPagamento = [
      { tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 10.000', valorSecundario: 'x', bullets: [], meioPagamento: 'pix' },
      { tipo: 'Cartão', titulo: '24x', valorPrincipal: 'R$ 999', valorSecundario: 'x', bullets: [], meioPagamento: 'cartao' },
    ];
    const r = await pa.generateProposalCore({ data: baseData({ formasPagamento }), modoEnvio: 'junior_envia', tipo: 'basica' });
    const cartao = r.proposalData.formasPagamento.find((f: any) => f.meioPagamento === 'cartao');
    expect(cartao.valorPrincipal).toBe('R$ 504');
  });
});
