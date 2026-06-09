// tests/proposal-geracao-estudo.test.ts
// Quando a proposta TEM estudo (anexos PVSol/PVsyst), a geração tem de ser a do
// estudo — nunca o cálculo padrão HSP. Sem o número do estudo, falha claro em vez
// de enganar o cliente com a estimativa. Pedido do Junior 09/06/2026.
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

const estudoAttach = [{ buffer: Buffer.from('fake-foto'), mimeType: 'image/jpeg', legenda: 'telhado' }];

describe('Geração sempre do estudo', () => {
  let pa: ProposalAssistant;

  beforeEach(() => {
    vi.stubEnv('HIGGSFIELD_CREDENTIALS', '');
    pa = new ProposalAssistant({
      apiKey: 'fake', redisHost: 'localhost', redisPort: 6379, redisPassword: undefined,
      knowledgeBaseDir: './conhecimento', driveUploader: null, engineerPhone: '5561111',
      supabaseService: fakeSupabase(), publicProposalBaseUrl: 'https://propostas.test',
    });
  });

  it('com estudo SEM geração informada → falha claro (não cai no cálculo HSP)', async () => {
    await expect(pa.generateProposalCore({
      data: baseData(), modoEnvio: 'junior_envia', tipo: 'personalizada', attachments: estudoAttach,
    })).rejects.toThrow(/geração do estudo/i);
  });

  it('com estudo + geração do estudo → usa a geração do estudo (não o cálculo)', async () => {
    const r = await pa.generateProposalCore({
      data: baseData({ geracaoMensalKwh: 1350 }), modoEnvio: 'junior_envia', tipo: 'personalizada', attachments: estudoAttach,
    });
    expect(r.calculations).toBeTruthy();
    expect(Math.round(r.calculations!.geracaoMensalKwh)).toBe(1350); // do estudo, não HSP
  });

  it('SEM estudo (sem anexos) NÃO exige geração — gera normal', async () => {
    const r = await pa.generateProposalCore({
      data: baseData(), modoEnvio: 'junior_envia', tipo: 'personalizada',
    });
    expect(r.calculations).toBeTruthy();
  });
});
