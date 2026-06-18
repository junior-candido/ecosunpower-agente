// tests/proposal-assistant-core.test.ts
// Testa que generateProposalCore aceita input estruturado e retorna slug+publicUrl+pdfBuffer.
// Mocka pdf-generator + Supabase pra rodar sem rede.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProposalAssistant, buildMensagemClienteProposta } from '../src/modules/proposal-assistant.js';

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
  updatePropostaPublica: vi.fn().mockResolvedValue(undefined),
  getClient: vi.fn().mockReturnValue({}),
});

describe('ProposalAssistant.generateProposalCore', () => {
  let pa: ProposalAssistant;
  let supabase: any;

  beforeEach(() => {
    // Sem credencial Higgsfield: a geração de imagem do serviço é best-effort e
    // fica desativada nos testes (determinístico, sem chamada de rede).
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

  it('básica: gera slug + publicUrl + pdfBuffer sem anexos', async () => {
    const r = await pa.generateProposalCore(inputBasico);
    expect(r.slug).toMatch(/^[A-Za-z0-9_-]{16,32}$/);
    expect(r.publicUrl).toBe(`https://propostas.test/p/${r.slug}`);
    expect(r.pdfBuffer.length).toBeGreaterThan(0);
    expect(r.proposalData.nomeCliente).toBe('Marcos Teste');
    expect(r.calculations.rsPorWp).toBeGreaterThan(0);
    expect(supabase.savePropostaPublica).toHaveBeenCalledOnce();
    // logos dos meios de pagamento também no solar ("replicar para tudo")
    const savedSolar = supabase.savePropostaPublica.mock.calls[0][0];
    expect(savedSolar.htmlContent).toContain('VISA'); // bandeira no cartão
    expect(savedSolar.htmlContent).toContain('Pix');   // selo PIX no à vista
  });

  it('só-serviço (sem solar): gera layout de serviço, calculations=null, salva tipo basica', async () => {
    const inputSoServico = {
      data: {
        nomeCliente: 'Edmilson Teste',
        telefoneCliente: '5561988887777',
        servicos: [{ titulo: 'Adequação de padrão', descricao: 'Troca pra trifásico', valorRs: 2800 }],
      },
      modoEnvio: 'eva_envia' as const,
      tipo: 'basica' as const,
    };
    const r = await pa.generateProposalCore(inputSoServico);
    expect(r.slug).toMatch(/^[A-Za-z0-9_-]{16,32}$/);
    expect(r.publicUrl).toBe(`https://propostas.test/p/${r.slug}`);
    expect(r.calculations).toBeNull(); // sem solar = sem payback/TIR
    expect(r.proposalData.nomeCliente).toBe('Edmilson Teste');

    // O HTML salvo é o layout de SERVIÇO, não o solar (sem "Payback").
    const saved = supabase.savePropostaPublica.mock.calls[0][0];
    expect(saved.tipo).toBe('basica');
    expect(saved.htmlContent).toContain('Adequação de padrão');
    expect(saved.htmlContent).toContain('Proposta de Serviço');
    expect(saved.htmlContent).not.toContain('Payback');
    // pagamento de serviço: PIX + cartão 12x, e NUNCA financiamento bancário (solar-only)
    expect(saved.htmlContent).toContain('PIX');
    expect(saved.htmlContent).toContain('12x');
    expect(saved.htmlContent).not.toContain('Financiamento');
    expect(saved.htmlContent).toContain('VISA'); // bandeiras embaixo do cartão
  });

  it('comparação 2 sistemas: mostra o quadro lado a lado e esconde gráfico/financeiro', async () => {
    const r = await pa.generateProposalCore({
      ...inputBasico,
      data: {
        ...inputBasico.data,
        comparacao: [
          { rotulo: 'Opção A', potenciaKwp: 8.4, valorTotalRs: 38500, modulo: { fabricante: 'Trina' }, inversor: { fabricante: 'Sungrow' } },
          { rotulo: 'Opção B', potenciaKwp: 8.0, valorTotalRs: 44000, modulo: { fabricante: 'LONGi' }, inversor: { fabricante: 'SolarEdge' } },
        ],
      },
    });
    expect(r.calculations).not.toBeNull(); // comparação ainda é proposta solar
    const saved = supabase.savePropostaPublica.mock.calls[0][0].htmlContent;
    expect(saved).toContain('Compare as opções');
    expect(saved).toContain('Opção A');
    expect(saved).toContain('Opção B');
    expect(saved).toContain('LONGi');
    // a análise pesada (de uma opção só) some na comparação
    expect(saved).not.toContain('Consumo × Geração mensal');
    expect(saved).not.toContain('Indicadores de viabilidade');
  });

  it('só-serviço: imagem (override do Junior) entra no HTML e fica em proposalData pro envio', async () => {
    const r = await pa.generateProposalCore({
      data: {
        nomeCliente: 'Edmilson Teste',
        telefoneCliente: '5561988887777',
        servicoImagemUrl: 'https://x.test/foto-servico.jpg',
        servicos: [{ titulo: 'Adequação de padrão', descricao: 'Troca pra trifásico', valorRs: 2800 }],
      },
      modoEnvio: 'eva_envia' as const,
      tipo: 'basica' as const,
    });
    // a imagem fica no HTML salvo (página web) ...
    const saved = supabase.savePropostaPublica.mock.calls[0][0].htmlContent;
    expect(saved).toContain('https://x.test/foto-servico.jpg');
    // ... e em proposalData.servicos, que o "enviar" reusa pro PDF bater com a web.
    expect((r.proposalData.servicos ?? [])[0]?.imagemUrl).toBe('https://x.test/foto-servico.jpg');
  });

  it('comparação com opção malformada (sem potência) cai na solar normal — nunca NaN', async () => {
    const r = await pa.generateProposalCore({
      ...inputBasico,
      data: {
        ...inputBasico.data,
        comparacao: [
          { rotulo: 'Opção A', potenciaKwp: 8.4, valorTotalRs: 38500, modulo: { fabricante: 'Trina' }, inversor: { fabricante: 'Sungrow' } },
          { rotulo: 'Opção B', valorTotalRs: 44000, modulo: { fabricante: 'LONGi' }, inversor: { fabricante: 'SolarEdge' } }, // sem potenciaKwp
        ],
      },
    });
    const saved = supabase.savePropostaPublica.mock.calls[0][0].htmlContent;
    expect(saved).not.toContain('Compare as opções'); // não monta quadro quebrado
    expect(saved).not.toContain('NaN');                // nunca NaN
    expect(saved).toContain('Consumo × Geração mensal'); // proposta solar normal volta
    expect(r.slug).toBeTruthy();
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

describe('buildMensagemClienteProposta — links web+pdf e economia', () => {
  const URL = 'https://propostas.ecosunpower.eng.br/p/zA17dxYrKR_6WnSe';

  it('inclui link web, link .pdf e a linha de economia formatada', () => {
    const msg = buildMensagemClienteProposta('Maria Silva', URL, false, `${URL}.pdf`, 10493);
    expect(msg).toContain('Maria'); // só primeiro nome
    expect(msg).not.toContain('Silva');
    expect(msg).toContain(URL);
    expect(msg).toContain(`${URL}.pdf`);
    expect(msg).toContain('R$ 10.493 mais barata por mês');
    expect(msg).not.toMatch(/drive/i);
  });

  it('sem economia (só-serviço) não imprime a linha do número', () => {
    const msg = buildMensagemClienteProposta('João', URL, true, `${URL}.pdf`, null);
    expect(msg).not.toMatch(/mais barata por mês/);
    expect(msg).toContain(`${URL}.pdf`);
  });

  it('economia zero ou negativa cai no fallback sem número', () => {
    const msg = buildMensagemClienteProposta('Ana', URL, false, `${URL}.pdf`, 0);
    expect(msg).not.toMatch(/mais barata por mês/);
  });
});
