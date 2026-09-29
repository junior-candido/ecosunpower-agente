// Cobrança recorrente — a ligação com o mundo real (servico.ts), com dublês:
// nenhuma chamada de rede de verdade, nenhum banco de verdade.
import { describe, it, expect } from 'vitest';
import {
  garantirLinkDaFatura, lancarReceitaDaFatura, criarVerificadorDeModelo, paraMotor, criarServicoCobranca,
} from '../src/modules/cobranca-recorrente/servico.js';
import type { FaturaRow } from '../src/modules/cobranca-recorrente/faturas-repo.js';
import type { AssinaturaMotor } from '../src/modules/cobranca-recorrente/motor.js';

type Chamada = { tabela: string; op: string; args: unknown[] };
function mockClient(respostas: Record<string, any[]>) {
  const chamadas: Chamada[] = [];
  const client = {
    from(tabela: string) {
      const resposta = () => (respostas[tabela] ?? []).shift() ?? { data: null, error: null };
      const chain: any = {};
      for (const op of ['insert', 'update', 'upsert', 'select', 'eq', 'neq', 'is', 'in', 'order', 'limit', 'gte', 'not', 'or']) {
        chain[op] = (...args: unknown[]) => { chamadas.push({ tabela, op, args }); return chain; };
      }
      chain.single = () => Promise.resolve(resposta());
      chain.maybeSingle = () => Promise.resolve(resposta());
      chain.then = (res: any, rej: any) => Promise.resolve(resposta()).then(res, rej);
      return chain;
    },
  };
  return { client: client as any, chamadas };
}

const A: AssinaturaMotor = {
  id: 'a1', nome: 'Jimena Pereira Fonseca', email: 'jimena@exemplo.invalid', telefone: '5577999610038',
  valorCentavos: 29700, status: 'ativa', diaVencimento: 10, inicioEm: '2026-10-01', companyId: 'c-conquista',
  descricao: 'Monitoramento de Usinas', leadId: 'lead-9',
};
const F: FaturaRow = {
  id: 'f1', assinaturaId: 'a1', companyId: 'c-conquista', donaCompanyId: 'casa', competencia: '2026-10-01', venceEm: '2026-10-10',
  valorCentavos: 29700, descricao: 'Monitoramento de Usinas', status: 'aberta', cobrancaId: null, linkUrl: null,
  pagoEm: null, pagoCentavos: null, taxaCentavos: null, metodo: null, formaBaixa: null, baixadoPor: null, lancamentoId: null,
  avisoFaturaEm: null, avisoD0Em: null, avisoD3Em: null, avisoAtrasoEm: null, reciboEm: null, canalUltimoAviso: null, criadoEm: '2026-10-07T12:00:00Z',
};

function ctxLink(o: { ok?: boolean; cliente?: any } = {}) {
  const cobrancasCriadas: any[] = []; const linksSalvos: any[] = []; const pedidos: any[] = [];
  return {
    cobrancasCriadas, linksSalvos, pedidos,
    ctx: {
      donaId: 'casa', handle: '$ecosun', baseUrl: 'https://painel.exemplo.invalid',
      criarCobranca: async (d: any) => { cobrancasCriadas.push(d); return { id: 'cob-1', orderNsu: 'nsu-unico-1' }; },
      salvarLinkCobranca: async (id: string, url: string) => { linksSalvos.push([id, url]); },
      criarLink: async (p: any) => { pedidos.push(p); return o.ok === false ? { ok: false as const, reason: 'InfinitePay /links HTTP 422: handle inválido' } : { ok: true as const, url: 'https://checkout.exemplo.invalid/pagar/1' }; },
    },
  };
}

describe('garantirLinkDaFatura', () => {
  it('já tem link → devolve sem chamar a InfinitePay', async () => {
    const t = ctxLink();
    const { client } = mockClient({});
    expect(await garantirLinkDaFatura({ ...t.ctx, client }, { ...F, linkUrl: 'https://x.invalid/l' }, A)).toBe('https://x.invalid/l');
    expect(t.pedidos).toHaveLength(0);
  });
  it('sem link: cria cobrança (order_nsu único), prende na fatura, pede o link com webhook e grava', async () => {
    const t = ctxLink();
    const { client, chamadas } = mockClient({ faturas_assinatura: [{ data: [{ id: 'f1' }], error: null }, { data: null, error: null }] });
    const url = await garantirLinkDaFatura({ ...t.ctx, client }, F, A);
    expect(url).toBe('https://checkout.exemplo.invalid/pagar/1');
    expect(t.cobrancasCriadas[0]).toMatchObject({ companyId: 'casa', assinaturaId: 'a1', leadId: 'lead-9', valorCentavos: 29700 });
    expect(t.pedidos[0]).toMatchObject({
      handle: '$ecosun', orderNsu: 'nsu-unico-1',
      itens: [{ descricao: 'Monitoramento de Usinas — outubro/2026', valorCentavos: 29700 }],
      webhookUrl: 'https://painel.exemplo.invalid/webhook/infinitepay', redirectUrl: 'https://painel.exemplo.invalid/pago',
      cliente: { nome: 'Jimena Pereira Fonseca', email: 'jimena@exemplo.invalid', telefone: '5577999610038' },
    });
    expect(t.linksSalvos).toEqual([['cob-1', 'https://checkout.exemplo.invalid/pagar/1']]);
    // a cobrança só é presa se a fatura ainda não tiver uma (corrida entre servidores)
    expect(chamadas.some((c) => c.tabela === 'faturas_assinatura' && c.op === 'is' && c.args[0] === 'cobranca_id')).toBe(true);
  });
  it('InfinitePay recusou → lança erro claro (o motor não gasta o aviso e avisa o Junior)', async () => {
    const t = ctxLink({ ok: false });
    const { client } = mockClient({ faturas_assinatura: [{ data: [{ id: 'f1' }], error: null }] });
    await expect(garantirLinkDaFatura({ ...t.ctx, client }, F, A)).rejects.toThrow(/InfinitePay recusou/);
  });
  it('tentativa anterior criou a cobrança mas o link falhou → reusa o MESMO order_nsu', async () => {
    const t = ctxLink();
    const { client } = mockClient({ cobrancas: [{ data: { order_nsu: 'nsu-antigo', link_url: null }, error: null }], faturas_assinatura: [{ data: null, error: null }] });
    await garantirLinkDaFatura({ ...t.ctx, client }, { ...F, cobrancaId: 'cob-velha' }, A);
    expect(t.cobrancasCriadas).toHaveLength(0);
    expect(t.pedidos[0].orderNsu).toBe('nsu-antigo');
  });
  it('sem INFINITEPAY_HANDLE → erro claro', async () => {
    const t = ctxLink();
    const { client } = mockClient({});
    await expect(garantirLinkDaFatura({ ...t.ctx, handle: undefined, client }, F, A)).rejects.toThrow(/INFINITEPAY_HANDLE/);
  });
});

describe('lancarReceitaDaFatura (caixa — Fatia 1 do financeiro)', () => {
  it('entrada confirmada, origem assinatura, banco InfinitePay, categoria Mensalidades', async () => {
    const criados: any[] = [];
    const { client } = mockClient({ financeiro_categorias: [{ data: [{ id: 'cat-mens', slug: 'mensalidades', nome: 'Mensalidades' }], error: null }] });
    const id = await lancarReceitaDaFatura(client, A, F, { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: '2026-10-09T18:00:00Z' },
      async (_c, l) => { criados.push(l); return 'lanc-1'; });
    expect(id).toBe('lanc-1');
    expect(criados[0]).toMatchObject({
      tipo: 'entrada', valor: 297, dataEvento: '2026-10-09', contraparte: 'Jimena Pereira Fonseca',
      descricao: 'Mensalidade — Monitoramento de Usinas — outubro/2026 — Jimena Pereira Fonseca (#f1)', categoriaId: 'cat-mens', pfPj: 'PJ',
      origem: 'assinatura', bancoConta: 'infinitepay', confianca: 'alta', leadId: 'lead-9',
    });
    expect(criados[0].extracao).toMatchObject({ fatura_id: 'f1', assinatura_id: 'a1', metodo: 'pix', taxa_centavos: null });
  });
  it('Pix direto → banco "desconhecido" (o Junior diz onde caiu no caixa)', async () => {
    const criados: any[] = [];
    const { client } = mockClient({ financeiro_categorias: [{ data: [], error: null }] });
    await lancarReceitaDaFatura(client, A, F, { pagoCentavos: 29700, metodo: 'pix_direto', formaBaixa: 'manual', baixadoPor: 'Junior', pagoEm: '2026-10-09T18:00:00Z' },
      async (_c, l) => { criados.push(l); return 'x'; });
    expect(criados[0]).toMatchObject({ bancoConta: 'desconhecido', categoriaId: null });
  });
  it('já lançado (DUPLICADO) → null, sem erro', async () => {
    const { client } = mockClient({ financeiro_categorias: [{ data: [], error: null }] });
    expect(await lancarReceitaDaFatura(client, A, F, { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: '2026-10-09T18:00:00Z' },
      async () => { throw new Error('DUPLICADO'); })).toBeNull();
  });
});

describe('criarVerificadorDeModelo (modelo aprovado na Meta?)', () => {
  it('só APROVADO em pt_BR conta; cache de 10 min', async () => {
    let chamadas = 0; let agora = 0;
    const v = criarVerificadorDeModelo(async () => { chamadas++; return [
      { name: 'cobranca_mensalidade_v1', status: 'APPROVED', language: 'pt_BR' },
      { name: 'recibo_mensalidade_v1', status: 'PENDING', language: 'pt_BR' },
    ]; }, () => agora);
    expect(await v('cobranca_mensalidade_v1')).toBe(true);
    expect(await v('recibo_mensalidade_v1')).toBe(false);
    expect(chamadas).toBe(1);
    agora = 11 * 60_000;
    await v('cobranca_mensalidade_v1');
    expect(chamadas).toBe(2);
  });
  it('sem WABA ou Meta fora do ar → false (cai no e-mail + Junior)', async () => {
    expect(await criarVerificadorDeModelo(null)('cobranca_mensalidade_v1')).toBe(false);
    expect(await criarVerificadorDeModelo(async () => { throw new Error('500'); })('cobranca_mensalidade_v1')).toBe(false);
  });
});

describe('paraMotor', () => {
  it('descrição vazia → nome do produto', () => {
    const m = paraMotor({ id: 'a1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'X', email: null, telefone: null, zapConfirmado: false, valorCentavos: 1, limite: null, venceEm: '2026-10-10', status: 'ativa', companyId: null, descricao: '', diaVencimento: 10, inicioEm: '2026-10-01' });
    expect(m).toMatchObject({ descricao: 'Monitoramento de Usinas', diaVencimento: 10, inicioEm: '2026-10-01', leadId: null });
  });
});

describe('criarServicoCobranca — isolamento e pagamento em dobro', () => {
  const infra = (client: any, junior: string[]) => criarServicoCobranca({
    client, donaId: 'casa', handle: '$ecosun', baseUrl: 'https://painel.exemplo.invalid',
    criarCobranca: async () => ({ id: 'cob', orderNsu: 'n' }), salvarLinkCobranca: async () => undefined,
    waba: null, email: null, avisarJunior: async (t) => { junior.push(t); }, liberarAcesso: async () => undefined,
    log: () => undefined,
  });
  it('marcar paga: fatura de outra dona (id forjado na URL) → não achada', async () => {
    const { client, chamadas } = mockClient({ faturas_assinatura: [{ data: null, error: null }] });
    const s = infra(client, []);
    expect(await s.marcarPagaManual('f-de-outro', 'Junior')).toEqual({ ok: false, motivo: 'nao_achada' });
    expect(chamadas).toContainEqual({ tabela: 'faturas_assinatura', op: 'eq', args: ['dona_company_id', 'casa'] });
  });
  it('webhook de uma cobrança cuja fatura JÁ foi paga (Pix direto antes) → avisa possível pagamento em dobro', async () => {
    const paga = { ...F, status: 'paga', cobranca_id: 'cob-1' };
    const linha = Object.fromEntries(Object.entries({
      id: 'f1', assinatura_id: 'a1', company_id: 'c-conquista', dona_company_id: 'casa', competencia: '2026-10-01', vence_em: '2026-10-10',
      valor_centavos: 29700, descricao: 'Monitoramento de Usinas', status: 'paga', cobranca_id: 'cob-1', metodo: 'pix_direto', forma_baixa: 'manual', criado_em: 'x',
    }));
    void paga;
    const { client } = mockClient({ faturas_assinatura: [{ data: linha, error: null }], assinaturas: [{ data: null, error: null }] });
    const junior: string[] = [];
    const s = infra(client, junior);
    const r = await s.baixarPorCobranca('cob-1', { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: '2026-10-09T18:00:00Z' });
    expect(r).toBe('ja_paga');
    expect(junior[0]).toMatch(/em dobro/);
  });
  it('cobrança sem fatura (link avulso antigo) → sem_fatura (o webhook segue o caminho antigo)', async () => {
    const { client } = mockClient({ faturas_assinatura: [{ data: null, error: null }] });
    const s = infra(client, []);
    expect(await s.baixarPorCobranca('cob-x', { pagoCentavos: 1, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: '2026-10-09T18:00:00Z' })).toBe('sem_fatura');
  });
});

describe('webhook repetido e retomada', () => {
  const infra2 = (client: any, junior: string[]) => criarServicoCobranca({
    client, donaId: 'casa', handle: '$ecosun', baseUrl: undefined,
    criarCobranca: async () => ({ id: 'cob', orderNsu: 'n' }), salvarLinkCobranca: async () => undefined,
    waba: null, email: null, avisarJunior: async (t) => { junior.push(t); }, liberarAcesso: async () => undefined, log: () => undefined,
  });
  const linhaPaga = (forma: string) => ({
    id: 'f1', assinatura_id: 'a1', company_id: null, dona_company_id: 'casa', competencia: '2026-10-01', vence_em: '2026-10-10',
    valor_centavos: 29700, descricao: 'X', status: 'paga', cobranca_id: 'cob-1', metodo: 'pix', forma_baixa: forma, criado_em: 'x',
  });
  it('webhook repetido de fatura já paga PELO LINK → silêncio (não é pagamento em dobro)', async () => {
    const { client } = mockClient({ faturas_assinatura: [{ data: linhaPaga('link'), error: null }] });
    const junior: string[] = [];
    expect(await infra2(client, junior).baixarPorCobranca('cob-1', { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: 'x' }, { novo: false })).toBe('ja_paga');
    expect(junior).toEqual([]);
  });
  it('pagamento NOVO numa fatura marcada como Pix direto → alerta', async () => {
    const { client } = mockClient({ faturas_assinatura: [{ data: linhaPaga('manual'), error: null }], assinaturas: [{ data: null, error: null }] });
    const junior: string[] = [];
    await infra2(client, junior).baixarPorCobranca('cob-1', { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: 'x' }, { novo: true });
    expect(junior[0]).toMatch(/em dobro/);
  });
  it('faturaAbertaDaCobranca: retomada só se a fatura ainda está aberta', async () => {
    const aberta = mockClient({ faturas_assinatura: [{ data: { ...linhaPaga('link'), status: 'aberta', forma_baixa: null }, error: null }] });
    expect(await infra2(aberta.client, []).faturaAbertaDaCobranca('cob-1')).toBe(true);
    const paga = mockClient({ faturas_assinatura: [{ data: linhaPaga('link'), error: null }] });
    expect(await infra2(paga.client, []).faturaAbertaDaCobranca('cob-1')).toBe(false);
    const nada = mockClient({ faturas_assinatura: [{ data: null, error: null }] });
    expect(await infra2(nada.client, []).faturaAbertaDaCobranca('cob-1')).toBe(false);
  });
});

describe('pausa da assistente — banco e botões (servico)', () => {
  const CASA = '00000000-0000-0000-0000-000000000001';
  const svc = (client: any, junior: string[] = []) => criarServicoCobranca({
    client, donaId: CASA, handle: '$ecosun', baseUrl: 'https://painel.exemplo.invalid',
    criarCobranca: async () => ({ id: 'cob', orderNsu: 'n' }), salvarLinkCobranca: async () => undefined,
    waba: null, email: null, avisarJunior: async (t) => { junior.push(t); }, liberarAcesso: async () => undefined, log: () => undefined,
  });
  const linhaAss = (o: Record<string, unknown>) => ({
    id: 'a1', produto_id: 'monitoramento', nome: 'Jimena', email: null, telefone: null, zap_confirmado: false, valor_centavos: 29700,
    limite: null, vence_em: '2026-10-10', status: 'ativa', company_id: 'c-conquista', dia_vencimento: 10, inicio_em: '2026-10-01',
    dona_company_id: CASA, pausa_automatica: true, dias_pausa: 3, pausa_adiada_ate: null, assistente_pausada_em: null, ...o,
  });

  it('"Pausar agora" na assinatura da CASA ou de cliente avulso → recusa, sem mexer no banco', async () => {
    for (const cid of [CASA, null]) {
      const { client, chamadas } = mockClient({ assinaturas: [{ data: linhaAss({ company_id: cid }), error: null }] });
      const r = await svc(client).pausarAgora('a1', '2026-10-13');
      expect(r.ok).toBe(false);
      expect(chamadas.some((c) => c.tabela === 'assinaturas' && c.op === 'update')).toBe(false);
    }
  });

  it('pausarAssistenteNoBanco: condicional (não pausada, não é a casa, tem empresa)', async () => {
    const { pausarAssistenteNoBanco } = await import('../src/modules/dashboard/assinaturas-store.js');
    const { client, chamadas } = mockClient({ assinaturas: [{ data: [{ id: 'a1' }], error: null }] });
    expect(await pausarAssistenteNoBanco(client, 'a1', CASA)).toBe(true);
    const f = chamadas.filter((c) => c.tabela === 'assinaturas').map((c) => [c.op, ...c.args]);
    expect(f).toEqual(expect.arrayContaining([['is', 'assistente_pausada_em', null], ['neq', 'company_id', CASA], ['not', 'company_id', 'is', null]]));
  });

  it('"Dar mais prazo": grava a data (hoje + N) pela dona e, se estava pausada, reativa', async () => {
    const junior: string[] = [];
    const { client, chamadas } = mockClient({
      assinaturas: [
        { data: linhaAss({ assistente_pausada_em: '2026-10-13T12:00:00Z' }), error: null }, // getAssinaturaDaDona
        { data: null, error: null },                                                         // editar
        { data: [{ id: 'a1' }], error: null },                                               // reativar
      ],
    });
    const r = await svc(client, junior).darMaisPrazo('a1', 5, '2026-10-13');
    expect(r).toMatchObject({ ok: true, ate: '2026-10-18', reativou: true });
    expect(chamadas).toContainEqual({ tabela: 'assinaturas', op: 'update', args: [{ pausa_adiada_ate: '2026-10-18' }] });
    expect(junior.some((t) => /você deu mais prazo/.test(t))).toBe(true);
    expect((await svc(mockClient({}).client).darMaisPrazo('a1', 0, '2026-10-13')).ok).toBe(false);
  });
});

describe('garantirLinkDaFatura — link ANTIGO do motor de antes (sem fatura)', () => {
  it('reusa a cobrança pendente do mesmo valor (não manda 2º link)', async () => {
    const t = ctxLink();
    const { client } = mockClient({
      cobrancas: [{ data: [{ id: 'cob-velha', link_url: 'https://checkout.exemplo.invalid/velho' }], error: null }],
      faturas_assinatura: [{ data: null, error: null }, { data: [{ id: 'f1' }], error: null }, { data: null, error: null }],
    });
    expect(await garantirLinkDaFatura({ ...t.ctx, client }, F, A)).toBe('https://checkout.exemplo.invalid/velho');
    expect(t.cobrancasCriadas).toHaveLength(0);
    expect(t.pedidos).toHaveLength(0);
  });
});

describe('logs sem dado pessoal', () => {
  it('erro da Meta/Resend: telefone e e-mail somem', async () => {
    const { semDadoPessoal } = await import('../src/modules/cobranca-recorrente/servico.js');
    expect(semDadoPessoal('recipient 5577999610038 invalid; to jimena@exemplo.invalid')).toBe('recipient [numero] invalid; to [email]');
    expect(semDadoPessoal(42)).toBe(42);
  });
});

describe('modelos APROVADOS — lista configurável (sem deploy)', () => {
  it('padrão (nada configurado): os 4 ativos na Meta em 28/09; os 2 da 2ª trava NÃO (ainda não existem)', async () => {
    const { criarListaDeModelosAprovados } = await import('../src/modules/cobranca-recorrente/servico.js');
    const ok = criarListaDeModelosAprovados(async () => null, undefined);
    for (const m of ['cobranca_mensalidade_v1', 'aviso_pausa_assistente_v1', 'assistente_pausada_v1', 'recibo_mensalidade_v1']) expect(await ok(m), m).toBe(true);
    for (const m of ['aviso_pausa_disparos_v1', 'disparos_pausados_v1']) expect(await ok(m), m).toBe(false);
  });
  it('app_flags manda (e é relida a cada 5 min); sem ela, a variável de ambiente', async () => {
    const { criarListaDeModelosAprovados } = await import('../src/modules/cobranca-recorrente/servico.js');
    let flag: string | null = 'cobranca_mensalidade_v1, recibo_mensalidade_v1';
    let t = 0;
    const ok = criarListaDeModelosAprovados(async () => flag, 'aviso_pausa_disparos_v1', () => t);
    expect(await ok('recibo_mensalidade_v1')).toBe(true);
    expect(await ok('assistente_pausada_v1')).toBe(false);
    flag = null; t = 6 * 60_000;
    expect(await ok('aviso_pausa_disparos_v1')).toBe(true);
    expect(await ok('recibo_mensalidade_v1')).toBe(false);
  });
  it('lerListaDeModelos aceita vírgula, espaço e ponto e vírgula', async () => {
    const { lerListaDeModelos } = await import('../src/modules/cobranca-recorrente/servico.js');
    expect(lerListaDeModelos(' a, b;c  d ')).toEqual(['a', 'b', 'c', 'd']);
    expect(lerListaDeModelos('  ')).toBeNull();
  });
  it('no serviço: modelo fora da lista → não vai pelo WhatsApp (plano B)', async () => {
    const { client } = mockClient({});
    const s = criarServicoCobranca({
      client, donaId: 'casa', handle: '$h', baseUrl: undefined,
      criarCobranca: async () => ({ id: 'c', orderNsu: 'n' }), salvarLinkCobranca: async () => undefined,
      waba: { sendTemplate: async () => undefined, listTemplates: async () => [] }, email: null,
      avisarJunior: async () => undefined, liberarAcesso: async () => undefined, log: () => undefined,
      modelosAprovados: async () => 'cobranca_mensalidade_v1',
    });
    expect(await s.modeloAprovado('cobranca_mensalidade_v1')).toBe(true);
    expect(await s.modeloAprovado('recibo_mensalidade_v1')).toBe(false);
  });
});
