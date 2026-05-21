// tests/proposal-assistant-core.test.ts
// Testa que generateProposalCore aceita input estruturado e retorna slug+publicUrl+pdfBuffer.
// Mocka pdf-generator + Supabase pra rodar sem rede.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProposalAssistant } from '../src/modules/proposal-assistant.js';

vi.mock('../src/modules/proposal/pdf-generator.js', () => ({
  htmlToPdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  gerarQrCodeDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,fake'),
}));

vi.mock('../src/modules/cases-fetcher.js', () => {
  const CasesFetcher = vi.fn().mockImplementation(function () {
    return { getByTipo: vi.fn().mockResolvedValue([]) };
  });
  return { CasesFetcher };
});

const inputBasico = {
  data: {
    nomeCliente: 'Marcos Teste',
    documentoCliente: '123.456.789-00',
    enderecoCliente: 'Rua X, 100 - Brasília-DF',
    telefoneCliente: '5561999999999',
    emailCliente: 'marcos@test.com',
    potenciaKwp: 8.4,
    fatorPerda: 0.80,
    consumoMensalKwh: 1000,
    tarifaRsKwh: 1.05,
    custoDisponibilidadeMensal: 50,
    tipoCliente: 'residencial',
    modalidade: 'autoconsumo local',
    concessionaria: 'Neoenergia DF',
    modulo: { fabricante: 'Trina', modelo: 'Vertex 700W', potenciaW: 700, quantidade: 12, garantiaDefeito: 12, garantiaEficiencia: 30, tecnologia: 'TOPCon' },
    inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1, garantia: 10, eficiencia: 0.985, tipoInversor: 'string' },
    estruturaFixacao: { tipo: 'Telha cerâmica', material: 'Alumínio anodizado', descricao: 'Ganchos' },
    valorTotalRs: 38500,
  },
  modoEnvio: 'junior_envia' as const,
  tipo: 'basica' as const,
};

const fakeSupabase = (): any => ({
  savePropostaPublica: vi.fn().mockResolvedValue({ id: 'fake-id', expiresAt: '2026-12-31' }),
  updatePropostaPublicaHtml: vi.fn().mockResolvedValue(undefined),
  getClient: vi.fn().mockReturnValue({}),
});

describe('ProposalAssistant.generateProposalCore', () => {
  let pa: ProposalAssistant;
  let supabase: any;

  beforeEach(() => {
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

  it('básica: gera slug + publicUrl + pdfBuffer sem anexos', async () => {
    const r = await pa.generateProposalCore(inputBasico);
    expect(r.slug).toMatch(/^[A-Za-z0-9_-]{16,32}$/);
    expect(r.publicUrl).toBe(`https://propostas.test/p/${r.slug}`);
    expect(r.pdfBuffer.length).toBeGreaterThan(0);
    expect(r.proposalData.nomeCliente).toBe('Marcos Teste');
    expect(r.calculations.rsPorWp).toBeGreaterThan(0);
    expect(supabase.savePropostaPublica).toHaveBeenCalledOnce();
  });

  it('personalizada sem attachments (lista vazia) cai no fluxo básico', async () => {
    const r = await pa.generateProposalCore({ ...inputBasico, tipo: 'personalizada', attachments: [] });
    expect(r.slug).toBeTruthy();
    expect(supabase.savePropostaPublica).toHaveBeenCalledOnce(); // sem stub pré-inserido
  });

  it('throw se nenhum destino (Drive nem Supabase) configurado', async () => {
    const paSemDestinos = new ProposalAssistant({
      apiKey: 'fake',
      redisHost: 'localhost', redisPort: 6379, redisPassword: undefined,
      knowledgeBaseDir: './conhecimento',
      driveUploader: null,
      engineerPhone: '5561111',
      supabaseService: null,
      publicProposalBaseUrl: 'https://propostas.test',
    });
    await expect(paSemDestinos.generateProposalCore(inputBasico)).rejects.toThrow(/destino/);
  });
});
