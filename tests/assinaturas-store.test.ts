// tests/assinaturas-store.test.ts
// Central de Assinaturas (fatia 1) — régua do Junior: aviso 8d antes,
// lembrete 2d antes, 3d de tolerância vencida, trava. Aqui: situação
// derivada (pra tela) e novo vencimento ao pagar (+1 mês).
import { describe, it, expect } from 'vitest';
import {
  situacaoDaAssinatura, novoVencimento,
  listarAssinaturas, criarAssinatura, renovarAssinatura,
  linkPendente, getAssinaturaDaDona, listarCobraveis, registrarPagamentoNaAssinatura, descricaoDaAssinatura,
  infoLimiteMonitoramento, contarUsinasAtivas,
} from '../src/modules/dashboard/assinaturas-store.js';

// Mock chainable do supabase-js (mesmo estilo dos testes de empresas):
// grava inserts/updates por tabela e devolve as respostas na ordem.
function mockClient(respostas: Record<string, any[]>) {
  const inserts: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};
  const client = {
    from(tabela: string) {
      const resposta = () => (respostas[tabela] ?? []).shift() ?? { data: null, error: null };
      const chain: any = {
        insert(row: any) { (inserts[tabela] ??= []).push(row); return chain; },
        update(row: any) { (updates[tabela] ??= []).push(row); return chain; },
        select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; },
        not() { return chain; }, in() { return chain; },
        single() { return Promise.resolve(resposta()); },
        maybeSingle() { return Promise.resolve(resposta()); },
        then(res: any, rej: any) { return Promise.resolve(resposta()).then(res, rej); },
      };
      return chain;
    },
  };
  return { client: client as any, inserts, updates };
}

describe('situacaoDaAssinatura (badge da tela)', () => {
  const base = { status: 'ativa' as const, venceEm: '2026-08-20' };
  it('travada/cancelada ganham de tudo', () => {
    expect(situacaoDaAssinatura({ ...base, status: 'travada' }, '2026-08-01')).toBe('travada');
    expect(situacaoDaAssinatura({ ...base, status: 'cancelada' }, '2026-08-01')).toBe('cancelada');
  });
  it('longe do vencimento → ativa', () => {
    expect(situacaoDaAssinatura(base, '2026-08-01')).toBe('ativa');
  });
  it('faltando 8 dias ou menos → vencendo (régua do aviso)', () => {
    expect(situacaoDaAssinatura(base, '2026-08-12')).toBe('vencendo');
    expect(situacaoDaAssinatura(base, '2026-08-20')).toBe('vencendo'); // vence HOJE
    expect(situacaoDaAssinatura(base, '2026-08-11')).toBe('ativa');    // 9 dias
  });
  it('passou do vencimento → vencida', () => {
    expect(situacaoDaAssinatura(base, '2026-08-21')).toBe('vencida');
  });
});

describe('novoVencimento (pagou → +1 mês)', () => {
  it('pagou adiantado: soma 1 mês A PARTIR DO VENCIMENTO (não perde dias)', () => {
    expect(novoVencimento('2026-08-20', '2026-08-14')).toBe('2026-09-20');
  });
  it('pagou atrasado: soma 1 mês a partir de HOJE (não cobra retroativo)', () => {
    expect(novoVencimento('2026-08-20', '2026-09-02')).toBe('2026-10-02');
  });
  it('fim de mês não estoura: 31/jan → 28/fev, 31/dez vira 31/jan do ano seguinte', () => {
    expect(novoVencimento('2026-01-31', '2026-01-01')).toBe('2026-02-28');
    expect(novoVencimento('2026-12-31', '2026-12-01')).toBe('2027-01-31');
  });
});

describe('listarAssinaturas', () => {
  it('devolve a lista com o nome do produto embutido', async () => {
    const { client } = mockClient({
      assinaturas: [{ data: [{ id: 'a1', produto_id: 'monitoramento', nome: 'Sabion', email: 't@x.com', telefone: null, zap_confirmado: false, valor_centavos: 29700, limite: 110, vence_em: '2026-08-29', status: 'ativa', assinatura_produtos: { nome: 'Monitoramento de Usinas' } }], error: null }],
    });
    const lista = await listarAssinaturas(client);
    expect(lista).toEqual([{ id: 'a1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'Sabion', email: 't@x.com', telefone: null, zapConfirmado: false, valorCentavos: 29700, limite: 110, venceEm: '2026-08-29', status: 'ativa', companyId: null, descricao: null, documento: null, diaVencimento: null, inicioEm: null, observacao: null, leadId: null, pausaAutomatica: true, diasPausa: 3, pausaAdiadaAte: null, assistentePausadaEm: null, diasTravaDisparos: 7, disparosPausadosEm: null }]);
  });
});

describe('criarAssinatura', () => {
  it('insere com os campos certos e devolve o id', async () => {
    const { client, inserts } = mockClient({ assinaturas: [{ data: { id: 'a2' }, error: null }] });
    const id = await criarAssinatura(client, { produtoId: 'calculadora', nome: 'Fulano', email: 'f@x.com', telefone: '61999998888', valorCentavos: 5700, limite: null, venceEm: '2026-08-29' });
    expect(id).toBe('a2');
    expect(inserts.assinaturas?.[0]).toMatchObject({ produto_id: 'calculadora', nome: 'Fulano', valor_centavos: 5700, vence_em: '2026-08-29' });
  });
});

describe('renovarAssinatura', () => {
  it('pagou → vence_em +1 mês e status volta pra ativa', async () => {
    const { client, updates } = mockClient({
      assinaturas: [
        { data: { vence_em: '2026-08-20' }, error: null },  // leitura
        { data: null, error: null },                         // update
      ],
    });
    await renovarAssinatura(client, 'a1', '2026-08-14');
    expect(updates.assinaturas?.[0]).toEqual({ vence_em: '2026-09-20', status: 'ativa' });
  });
});

describe('editarAssinatura — zap confirmado', () => {
  it('grava zap_confirmado quando o campo vem', async () => {
    const { editarAssinatura } = await import('../src/modules/dashboard/assinaturas-store.js');
    const { client, updates } = mockClient({ assinaturas: [{ data: null, error: null }] });
    await editarAssinatura(client, 'a1', { zapConfirmado: true });
    expect(updates.assinaturas?.[0]).toEqual({ zap_confirmado: true });
  });
});

describe('assinaturaDaEmpresa (fatia 4 — Minha assinatura do tenant)', () => {
  it('devolve a assinatura (ativa/travada) da empresa', async () => {
    const { client } = mockClient({
      assinaturas: [{ data: [{ id: 'a1', produto_id: 'monitoramento', nome: 'Sabion', email: null, telefone: null, zap_confirmado: false, valor_centavos: 29700, limite: 110, vence_em: '2026-08-29', status: 'ativa', company_id: 'c1', assinatura_produtos: { nome: 'Monitoramento de Usinas' } }], error: null }],
    });
    const { assinaturaDaEmpresa } = await import('../src/modules/dashboard/assinaturas-store.js');
    const a = await assinaturaDaEmpresa(client, 'c1');
    expect(a?.id).toBe('a1');
    expect(a?.produtoNome).toBe('Monitoramento de Usinas');
  });
  it('empresa sem assinatura → null', async () => {
    const { client } = mockClient({ assinaturas: [{ data: [], error: null }] });
    const { assinaturaDaEmpresa } = await import('../src/modules/dashboard/assinaturas-store.js');
    expect(await assinaturaDaEmpresa(client, 'c1')).toBeNull();
  });
});

describe('limite do plano (fatia 3b — trava das 110 usinas)', () => {
  it('infoLimiteMonitoramento: acha a assinatura de monitoramento com limite da empresa', async () => {
    const { client } = mockClient({
      assinaturas: [{ data: [{ id: 'a1', limite: 110, nome: 'Sabion' }], error: null }],
    });
    expect(await infoLimiteMonitoramento(client, 'comp-sabion')).toEqual({ assinaturaId: 'a1', limite: 110, nome: 'Sabion' });
  });
  it('empresa sem assinatura com limite → null (sem trava)', async () => {
    const { client } = mockClient({ assinaturas: [{ data: [], error: null }] });
    expect(await infoLimiteMonitoramento(client, 'comp-x')).toBeNull();
  });
  it('contarUsinasAtivas usa o count do banco', async () => {
    const { client } = mockClient({ sistemas_clientes: [{ data: null, error: null, count: 87 }] });
    expect(await contarUsinasAtivas(client, 'comp-sabion')).toBe(87);
  });
});

describe('linkPendente (link antigo de cobrança avulsa da assinatura)', () => {
  it('devolve o link da cobrança pendente (ou null)', async () => {
    const { client } = mockClient({ cobrancas: [{ data: [{ link_url: 'https://checkout.infinitepay.io/x' }], error: null }] });
    expect(await linkPendente(client, 'a1')).toBe('https://checkout.infinitepay.io/x');
    const vazio = mockClient({ cobrancas: [{ data: [], error: null }] });
    expect(await linkPendente(vazio.client, 'a1')).toBeNull();
  });
});

// ---- Cobrança recorrente (146) ----

/** Mock que também grava os filtros (eq/in/not) — pra provar o isolamento. */
function mockComFiltros(respostas: Record<string, any[]>) {
  const filtros: Array<[string, string, unknown[]]> = [];
  const updates: Record<string, any[]> = {};
  const inserts: Record<string, any[]> = {};
  const client = {
    from(tabela: string) {
      const resposta = () => (respostas[tabela] ?? []).shift() ?? { data: null, error: null };
      const chain: any = {
        insert(row: any) { (inserts[tabela] ??= []).push(row); return chain; },
        update(row: any) { (updates[tabela] ??= []).push(row); return chain; },
        select() { return chain; }, order() { return chain; }, limit() { return chain; },
        eq(...a: unknown[]) { filtros.push([tabela, 'eq', a]); return chain; },
        in(...a: unknown[]) { filtros.push([tabela, 'in', a]); return chain; },
        not(...a: unknown[]) { filtros.push([tabela, 'not', a]); return chain; },
        single() { return Promise.resolve(resposta()); },
        maybeSingle() { return Promise.resolve(resposta()); },
        then(res: any, rej: any) { return Promise.resolve(resposta()).then(res, rej); },
      };
      return chain;
    },
  };
  return { client: client as any, filtros, updates, inserts };
}

const LINHA_146 = {
  id: 'a1', produto_id: 'monitoramento', nome: 'Jimena Pereira Fonseca', email: 'j@exemplo.invalid', telefone: '5577999610038',
  zap_confirmado: false, valor_centavos: 29700, limite: null, vence_em: '2026-10-10', status: 'ativa', company_id: 'c-conquista',
  descricao: 'Plataforma de monitoramento', documento: '04520636000115', dia_vencimento: 10, inicio_em: '2026-10-01',
  observacao: 'paga às vezes pelo CPF', lead_id: null, dona_company_id: 'casa', assinatura_produtos: { nome: 'Monitoramento de Usinas' },
};

describe('assinaturas — campos da cobrança recorrente', () => {
  it('lê dia, início, CPF/CNPJ, descrição, observação e a dona', async () => {
    const { client, filtros } = mockComFiltros({ assinaturas: [{ data: LINHA_146, error: null }] });
    const a = await getAssinaturaDaDona(client, 'casa', 'a1');
    expect(a).toMatchObject({ diaVencimento: 10, inicioEm: '2026-10-01', documento: '04520636000115', descricao: 'Plataforma de monitoramento', observacao: 'paga às vezes pelo CPF', donaCompanyId: 'casa', companyId: 'c-conquista' });
    expect(filtros).toEqual(expect.arrayContaining([['assinaturas', 'eq', ['dona_company_id', 'casa']], ['assinaturas', 'eq', ['id', 'a1']]]));
  });
  it('descrição que o cliente vê: a da assinatura; vazia → nome do produto', () => {
    expect(descricaoDaAssinatura({ descricao: '  ', produtoNome: 'Monitoramento de Usinas' })).toBe('Monitoramento de Usinas');
    expect(descricaoDaAssinatura({ descricao: 'Plano Pro', produtoNome: 'X' })).toBe('Plano Pro');
  });
  it('listarAssinaturas(dona) filtra pela dona', async () => {
    const { client, filtros } = mockComFiltros({ assinaturas: [{ data: [LINHA_146], error: null }] });
    await listarAssinaturas(client, 'casa');
    expect(filtros).toContainEqual(['assinaturas', 'eq', ['dona_company_id', 'casa']]);
  });
  it('listarCobraveis: dona + ativa/suspensa + com dia de vencimento', async () => {
    const { client, filtros } = mockComFiltros({ assinaturas: [{ data: [LINHA_146], error: null }] });
    expect(await listarCobraveis(client, 'casa')).toHaveLength(1);
    expect(filtros).toEqual(expect.arrayContaining([
      ['assinaturas', 'eq', ['dona_company_id', 'casa']],
      ['assinaturas', 'in', ['status', ['ativa', 'travada']]],
      ['assinaturas', 'not', ['dia_vencimento', 'is', null]],
    ]));
  });
  it('criarAssinatura grava os campos novos e a dona', async () => {
    const { client, inserts } = mockComFiltros({ assinaturas: [{ data: { id: 'a9' }, error: null }] });
    await criarAssinatura(client, {
      produtoId: 'monitoramento', nome: 'Jimena', valorCentavos: 29700, venceEm: '2026-10-10', companyId: 'c-conquista',
      descricao: 'Plataforma', documento: '04520636000115', diaVencimento: 10, inicioEm: '2026-10-01', observacao: 'obs', donaId: 'casa',
    });
    expect(inserts.assinaturas?.[0]).toMatchObject({ dia_vencimento: 10, inicio_em: '2026-10-01', documento: '04520636000115', descricao: 'Plataforma', observacao: 'obs', dona_company_id: 'casa', company_id: 'c-conquista' });
  });
  it('editarAssinatura com dona filtra pela dona (id da URL nunca vale sozinho)', async () => {
    const { client, filtros, updates } = mockComFiltros({ assinaturas: [{ data: null, error: null }] });
    const { editarAssinatura } = await import('../src/modules/dashboard/assinaturas-store.js');
    await editarAssinatura(client, 'a1', { valorCentavos: 35000, diaVencimento: 15, email: null }, 'casa');
    expect(updates.assinaturas?.[0]).toEqual({ valor_centavos: 35000, dia_vencimento: 15, email: null });
    expect(filtros).toContainEqual(['assinaturas', 'eq', ['dona_company_id', 'casa']]);
  });
});

describe('registrarPagamentoNaAssinatura (fatura paga)', () => {
  it('vencimento anda pra frente e acesso suspenso volta pra ativa', async () => {
    const { client, updates } = mockComFiltros({ assinaturas: [{ data: { vence_em: '2026-10-10', status: 'travada' }, error: null }, { data: null, error: null }] });
    expect(await registrarPagamentoNaAssinatura(client, 'a1', '2026-11-10')).toBe(true);
    expect(updates.assinaturas?.[0]).toMatchObject({ vence_em: '2026-11-10', status: 'ativa' });
  });
  it('pausada continua pausada; vencimento nunca volta pra trás', async () => {
    const { client, updates } = mockComFiltros({ assinaturas: [{ data: { vence_em: '2026-12-10', status: 'pausada' }, error: null }, { data: null, error: null }] });
    expect(await registrarPagamentoNaAssinatura(client, 'a1', '2026-11-10')).toBe(false);
    expect(updates.assinaturas?.[0]).not.toHaveProperty('vence_em');
    expect(updates.assinaturas?.[0]).not.toHaveProperty('status');
  });
});
