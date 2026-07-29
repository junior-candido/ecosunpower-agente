// tests/assinaturas-store.test.ts
// Central de Assinaturas (fatia 1) — régua do Junior: aviso 8d antes,
// lembrete 2d antes, 3d de tolerância vencida, trava. Aqui: situação
// derivada (pra tela) e novo vencimento ao pagar (+1 mês).
import { describe, it, expect } from 'vitest';
import {
  situacaoDaAssinatura, novoVencimento,
  listarAssinaturas, criarAssinatura, renovarAssinatura,
  listarAtivas, avisosDoCiclo, registrarAviso, linkPendente,
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
    expect(lista).toEqual([{ id: 'a1', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas', nome: 'Sabion', email: 't@x.com', telefone: null, zapConfirmado: false, valorCentavos: 29700, limite: 110, venceEm: '2026-08-29', status: 'ativa', companyId: null }]);
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

describe('apoios do motor (fatia 2)', () => {
  it('listarAtivas devolve só as ativas (filtro no banco)', async () => {
    const { client } = mockClient({
      assinaturas: [{ data: [{ id: 'a1', produto_id: 'calculadora', nome: 'F', email: null, telefone: null, zap_confirmado: false, valor_centavos: 5700, limite: null, vence_em: '2026-08-29', status: 'ativa', company_id: null, assinatura_produtos: { nome: 'Calculadora' } }], error: null }],
    });
    const lista = await listarAtivas(client);
    expect(lista.length).toBe(1);
    expect(lista[0]!.produtoNome).toBe('Calculadora');
  });
  it('avisosDoCiclo devolve os tipos já enviados como Set', async () => {
    const { client } = mockClient({ assinatura_avisos: [{ data: [{ tipo: 'aviso8' }, { tipo: 'aviso2' }], error: null }] });
    const s = await avisosDoCiclo(client, 'a1', '2026-08-20');
    expect(s.has('aviso8')).toBe(true);
    expect(s.has('ultimo')).toBe(false);
  });
  it('registrarAviso insere com company_id; UNIQUE duplicado não explode', async () => {
    const { client, inserts } = mockClient({ assinatura_avisos: [{ data: null, error: null }] });
    await registrarAviso(client, 'a1', 'comp-1', 'aviso8', '2026-08-20');
    expect(inserts.assinatura_avisos?.[0]).toEqual({ assinatura_id: 'a1', company_id: 'comp-1', tipo: 'aviso8', ciclo: '2026-08-20' });
    const dup = mockClient({ assinatura_avisos: [{ data: null, error: { message: 'duplicate key value violates unique constraint' } }] });
    await expect(registrarAviso(dup.client, 'a1', null, 'aviso8', '2026-08-20')).resolves.toBeUndefined();
  });
  it('linkPendente devolve o link da cobrança pendente (ou null)', async () => {
    const { client } = mockClient({ cobrancas: [{ data: [{ link_url: 'https://checkout.infinitepay.io/x' }], error: null }] });
    expect(await linkPendente(client, 'a1')).toBe('https://checkout.infinitepay.io/x');
    const vazio = mockClient({ cobrancas: [{ data: [], error: null }] });
    expect(await linkPendente(vazio.client, 'a1')).toBeNull();
  });
});
