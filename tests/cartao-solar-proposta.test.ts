// tests/cartao-solar-proposta.test.ts
// A proposta sai com os DOIS cartões (parceria até 24× + Sol Fácil/Fortlev até 18×),
// os valores são FORÇADOS pela fonte única mesmo quando a Eva monta formasPagamento
// à mão, e NENHUMA forma de pagamento sai pro cliente sem valor ("undefined" na
// proposta = bug real de 03/08/2026, na tela do Junior).
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

function novaAssistente(): ProposalAssistant {
  return new ProposalAssistant({
    apiKey: 'fake',
    redisHost: 'localhost', redisPort: 6379, redisPassword: undefined,
    knowledgeBaseDir: './conhecimento',
    driveUploader: null,
    engineerPhone: '5561111',
    supabaseService: fakeSupabase(),
    publicProposalBaseUrl: 'https://propostas.test',
  });
}

describe('Os dois cartões na proposta (parceria 24× + Sol Fácil 18×)', () => {
  let pa: ProposalAssistant;

  beforeEach(() => {
    vi.stubEnv('HIGGSFIELD_CREDENTIALS', '');
    pa = novaAssistente();
  });

  it('default: proposta sai com 4 formas — à vista, cartão 24×, cartão 18× e financiamento', async () => {
    const r = await pa.generateProposalCore({ data: baseData(), modoEnvio: 'junior_envia', tipo: 'basica' });
    const formas = r.proposalData.formasPagamento;
    const cartoes = formas.filter((f: any) => f.meioPagamento === 'cartao');
    expect(formas).toHaveLength(4);
    expect(cartoes).toHaveLength(2);
    expect(formas.some((f: any) => f.meioPagamento === 'pix')).toBe(true);
    expect(formas.some((f: any) => f.meioPagamento === 'financiamento')).toBe(true);
  });

  it('cartão da parceria: 24× exato da tabela (R$ 10.000 → R$ 504)', async () => {
    const r = await pa.generateProposalCore({ data: baseData(), modoEnvio: 'junior_envia', tipo: 'basica' });
    const parceria = r.proposalData.formasPagamento.find((f: any) => f.tabelaCartao === 'parceria');
    expect(parceria).toBeTruthy();
    expect(parceria.valorPrincipal).toBe('R$ 504');
    expect(parceria.bullets.join(' ')).toMatch(/Visa\/Amex.*24.*Master\/Elo.*21.*12/i);
  });

  it('cartão Sol Fácil: 18× exato da tabela por dentro (R$ 10.000 → R$ 623) + sem juros até 3×', async () => {
    const r = await pa.generateProposalCore({ data: baseData(), modoEnvio: 'junior_envia', tipo: 'basica' });
    const solfacil = r.proposalData.formasPagamento.find((f: any) => f.tabelaCartao === 'solfacil');
    expect(solfacil).toBeTruthy();
    // 10.000 ÷ (1 − 0,1079) = 11.209,50 → ÷18 = 622,75 → R$ 623
    expect(solfacil.valorPrincipal).toBe('R$ 623');
    expect(solfacil.bullets.join(' ')).toMatch(/sem juros até 3×/i);
  });

  it('override: Eva manda cartão com valor errado → sistema força o exato da tabela certa', async () => {
    const formasPagamento = [
      { tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 10.000', valorSecundario: 'x', bullets: [], meioPagamento: 'pix' },
      { tipo: 'Cartão', titulo: 'Cartão de crédito 18×', valorPrincipal: 'R$ 999', valorSecundario: 'x', bullets: [], meioPagamento: 'cartao', tabelaCartao: 'solfacil' },
    ];
    const r = await pa.generateProposalCore({ data: baseData({ formasPagamento }), modoEnvio: 'junior_envia', tipo: 'basica' });
    const cartao = r.proposalData.formasPagamento.find((f: any) => f.meioPagamento === 'cartao');
    expect(cartao.valorPrincipal).toBe('R$ 623');
  });

  it('cartão da Eva SEM marcador de tabela: "18×" no texto → Sol Fácil; sem pista → parceria', async () => {
    const formasPagamento = [
      { tipo: 'Cartão', titulo: 'Cartão de crédito 18×', valorPrincipal: '', valorSecundario: '', bullets: [], meioPagamento: 'cartao' },
      { tipo: 'Cartão', titulo: 'Cartão de crédito', valorPrincipal: '', valorSecundario: '', bullets: [], meioPagamento: 'cartao' },
    ];
    const r = await pa.generateProposalCore({ data: baseData({ formasPagamento }), modoEnvio: 'junior_envia', tipo: 'basica' });
    const cartoes = r.proposalData.formasPagamento.filter((f: any) => f.meioPagamento === 'cartao');
    expect(cartoes[0].valorPrincipal).toBe('R$ 623'); // 18× → Sol Fácil
    expect(cartoes[1].valorPrincipal).toBe('R$ 504'); // sem pista → parceria 24×
  });

  it('nome de distribuidor NUNCA vai pro cliente no cartão (Belenus, Sol Fácil, Fortlev)', async () => {
    const formasPagamento = [
      { tipo: 'Cartão Sol Fácil', titulo: 'Solfácil em 18×', valorPrincipal: 'R$ 999',
        valorSecundario: 'aprovação Belenus imediata',
        bullets: ['Parcelamento Sol Fácil igual Fortlev — taxa especial', 'Aprovação imediata'],
        meioPagamento: 'cartao', tabelaCartao: 'solfacil' },
    ];
    const r = await pa.generateProposalCore({ data: baseData({ formasPagamento }), modoEnvio: 'junior_envia', tipo: 'basica' });
    const cartao = r.proposalData.formasPagamento.find((f: any) => f.meioPagamento === 'cartao');
    const tudo = [cartao.tipo, cartao.titulo, cartao.valorSecundario, ...cartao.bullets].join(' | ').toLowerCase();
    expect(tudo).not.toContain('belenus');
    expect(tudo).not.toMatch(/sol\s*f[aá]cil|fortlev/);
    expect(cartao.tipo).toBe('Cartão de crédito');
    expect(cartao.bullets.some((b: string) => b.includes('Aprovação imediata'))).toBe(true);
  });

  it('no financiamento o banco parceiro PODE aparecer (Solfácil é banco lá, não bandeira)', async () => {
    const r = await pa.generateProposalCore({ data: baseData(), modoEnvio: 'junior_envia', tipo: 'basica' });
    const fin = r.proposalData.formasPagamento.find((f: any) => f.meioPagamento === 'financiamento');
    expect(fin.bullets.join(' ')).toMatch(/Solfácil/);
  });
});

describe('Nunca "undefined" pro cliente (bug real da proposta de 03/08)', () => {
  let pa: ProposalAssistant;

  beforeEach(() => {
    vi.stubEnv('HIGGSFIELD_CREDENTIALS', '');
    pa = novaAssistente();
  });

  it('Eva manda financiamento SEM valor → sistema calcula a parcela (Price 90× c/ carência)', async () => {
    const formasPagamento = [
      { tipo: 'À Vista', titulo: 'PIX ou TED', valorPrincipal: 'R$ 10.000', valorSecundario: 'pagamento único', recomendado: true, bullets: ['Sem juros'], meioPagamento: 'pix' },
      { tipo: 'Cartão', titulo: 'Cartão de crédito 18×', valorPrincipal: '', valorSecundario: '', bullets: [], meioPagamento: 'cartao' },
      { tipo: 'Financiamento', titulo: 'Financiamento Solfácil até 90×',
        valorSecundario: undefined, bullets: ['Aprovação em 24-48h'], meioPagamento: 'financiamento' },
    ];
    const r = await pa.generateProposalCore({ data: baseData({ formasPagamento }), modoEnvio: 'junior_envia', tipo: 'basica' });
    const fin = r.proposalData.formasPagamento.find((f: any) => f.meioPagamento === 'financiamento');
    // R$ 10.000 × 1,014⁴ (carência 120d) → Price 90× a 1,4% a.m. = R$ 207/mês
    expect(fin.valorPrincipal).toBe('R$ 207');
    expect(JSON.stringify(r.proposalData.formasPagamento)).not.toContain('undefined');
  });

  it('à vista sem valor → cai no valor total (nunca vazio)', async () => {
    const formasPagamento = [
      { tipo: 'À Vista', titulo: 'PIX', valorSecundario: '', bullets: [], meioPagamento: 'pix' },
    ];
    const r = await pa.generateProposalCore({ data: baseData({ formasPagamento }), modoEnvio: 'junior_envia', tipo: 'basica' });
    const pix = r.proposalData.formasPagamento.find((f: any) => f.meioPagamento === 'pix');
    expect(pix.valorPrincipal).toBe('R$ 10.000');
  });
});
