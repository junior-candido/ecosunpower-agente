// Cobrança recorrente — acesso ao banco das FATURAS (service-role; a RLS da
// 146 é a segunda trava). O que importa aqui: idempotência (fatura repetida e
// aviso repetido não passam), baixa só uma vez, e todo filtro de empresa no
// lugar (dona na casa; company_id do tenant na "Minha assinatura").
import { describe, it, expect } from 'vitest';
import {
  criarFatura, reservarAviso, liberarAviso, marcarFaturaPaga, faturasDoTenant,
  faturasDaDona, faturasDaAssinatura, getFaturaPorCobranca, reservarExecucaoDoDia,
  salvarCobrancaDaFatura, getFaturaDaDona, paraFatura,
} from '../src/modules/cobranca-recorrente/faturas-repo.js';

type Chamada = { tabela: string; op: string; args: unknown[] };

/** Mock encadeável que grava TODAS as chamadas e devolve respostas por tabela, em ordem. */
function mockClient(respostas: Record<string, any[]>) {
  const chamadas: Chamada[] = [];
  const client = {
    from(tabela: string) {
      const resposta = () => (respostas[tabela] ?? []).shift() ?? { data: null, error: null };
      const chain: any = {};
      for (const op of ['insert', 'update', 'upsert', 'select', 'eq', 'neq', 'is', 'in', 'order', 'limit', 'gte', 'lte', 'lt', 'not', 'or']) {
        chain[op] = (...args: unknown[]) => { chamadas.push({ tabela, op, args }); return chain; };
      }
      chain.single = () => Promise.resolve(resposta());
      chain.maybeSingle = () => Promise.resolve(resposta());
      chain.then = (res: any, rej: any) => Promise.resolve(resposta()).then(res, rej);
      return chain;
    },
  };
  const filtros = (op: string) => chamadas.filter((c) => c.op === op).map((c) => c.args);
  return { client: client as any, chamadas, filtros };
}

const LINHA = {
  id: 'f1', assinatura_id: 'a1', company_id: 'c-tenant', dona_company_id: 'casa', competencia: '2026-10-01', vence_em: '2026-10-10',
  valor_centavos: 29700, descricao: 'Monitoramento de Usinas', status: 'aberta', cobranca_id: null, link_url: null,
  pago_em: null, pago_centavos: null, taxa_centavos: null, metodo: null, forma_baixa: null, baixado_por: null, lancamento_id: null,
  aviso_fatura_em: null, aviso_d0_em: null, aviso_d3_em: null, aviso_atraso_em: null, recibo_em: null, canal_ultimo_aviso: null,
  criado_em: '2026-10-07T12:00:00Z',
};

describe('paraFatura', () => {
  it('snake_case do banco → camelCase', () => {
    expect(paraFatura(LINHA)).toMatchObject({ id: 'f1', assinaturaId: 'a1', companyId: 'c-tenant', competencia: '2026-10-01', venceEm: '2026-10-10', valorCentavos: 29700, status: 'aberta', avisoFaturaEm: null });
  });
});

describe('criarFatura', () => {
  it('insere com a cópia do valor/descrição e do tenant', async () => {
    const { client, chamadas } = mockClient({ faturas_assinatura: [{ data: LINHA, error: null }] });
    const f = await criarFatura(client, { assinaturaId: 'a1', companyId: 'c-tenant', donaId: 'casa', competencia: '2026-10-01', venceEm: '2026-10-10', valorCentavos: 29700, descricao: 'Monitoramento de Usinas' });
    expect(f?.id).toBe('f1');
    expect(chamadas.find((c) => c.op === 'insert')?.args[0]).toEqual({
      assinatura_id: 'a1', company_id: 'c-tenant', dona_company_id: 'casa', competencia: '2026-10-01', vence_em: '2026-10-10', valor_centavos: 29700, descricao: 'Monitoramento de Usinas',
    });
  });
  it('mês que já existe (unique) → null, sem erro (idempotência)', async () => {
    const { client } = mockClient({ faturas_assinatura: [{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }] });
    expect(await criarFatura(client, { assinaturaId: 'a1', companyId: null, donaId: 'casa', competencia: '2026-10-01', venceEm: '2026-10-10', valorCentavos: 29700, descricao: 'X' })).toBeNull();
  });
  it('outro erro → lança', async () => {
    const { client } = mockClient({ faturas_assinatura: [{ data: null, error: { code: '42P01', message: 'relation does not exist' } }] });
    await expect(criarFatura(client, { assinaturaId: 'a1', companyId: null, donaId: 'casa', competencia: '2026-10-01', venceEm: '2026-10-10', valorCentavos: 1, descricao: 'X' })).rejects.toThrow(/relation/);
  });
});

describe('reservarAviso (reserva ANTES de enviar = nunca sai 2x)', () => {
  it('só reserva se a coluna está vazia e a fatura aberta; devolve true se ganhou', async () => {
    const { client, chamadas, filtros } = mockClient({ faturas_assinatura: [{ data: [{ id: 'f1' }], error: null }] });
    expect(await reservarAviso(client, 'f1', 'lembrete_d0')).toBe(true);
    const upd = chamadas.find((c) => c.op === 'update')!.args[0] as Record<string, unknown>;
    expect(Object.keys(upd)).toEqual(['aviso_d0_em']);
    expect(filtros('is')).toContainEqual(['aviso_d0_em', null]);
    expect(filtros('eq')).toContainEqual(['status', 'aberta']);
    expect(filtros('eq')).toContainEqual(['id', 'f1']);
  });
  it('outro já reservou → false', async () => {
    const { client } = mockClient({ faturas_assinatura: [{ data: [], error: null }] });
    expect(await reservarAviso(client, 'f1', 'fatura')).toBe(false);
  });
  it('recibo reserva recibo_em (fatura já paga)', async () => {
    const { client, chamadas, filtros } = mockClient({ faturas_assinatura: [{ data: [{ id: 'f1' }], error: null }] });
    expect(await reservarAviso(client, 'f1', 'recibo')).toBe(true);
    expect(Object.keys(chamadas.find((c) => c.op === 'update')!.args[0] as object)).toEqual(['recibo_em']);
    expect(filtros('eq')).toContainEqual(['status', 'paga']);
  });
  it('liberarAviso devolve a coluna pra nulo (envio falhou em todos os canais → tenta amanhã)', async () => {
    const { client, chamadas } = mockClient({ faturas_assinatura: [{ data: null, error: null }] });
    await liberarAviso(client, 'f1', 'lembrete_d3');
    expect(chamadas.find((c) => c.op === 'update')!.args[0]).toEqual({ aviso_d3_em: null });
  });
});

describe('marcarFaturaPaga', () => {
  it('só marca se ainda aberta; devolve true na 1ª vez', async () => {
    const { client, chamadas, filtros } = mockClient({ faturas_assinatura: [{ data: [{ id: 'f1' }], error: null }] });
    const ok = await marcarFaturaPaga(client, 'f1', { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: '2026-10-09T18:00:00Z' });
    expect(ok).toBe(true);
    expect(chamadas.find((c) => c.op === 'update')!.args[0]).toMatchObject({ status: 'paga', pago_centavos: 29700, metodo: 'pix', forma_baixa: 'link', pago_em: '2026-10-09T18:00:00Z' });
    expect(filtros('eq')).toContainEqual(['status', 'aberta']);
  });
  it('já paga → false (webhook repetido não reprocessa)', async () => {
    const { client } = mockClient({ faturas_assinatura: [{ data: [], error: null }] });
    expect(await marcarFaturaPaga(client, 'f1', { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: '2026-10-09T18:00:00Z' })).toBe(false);
  });
});

describe('filtros de empresa (isolamento)', () => {
  it('faturasDoTenant filtra pelo company_id da sessão', async () => {
    const { client, filtros } = mockClient({ faturas_assinatura: [{ data: [LINHA], error: null }] });
    const fs = await faturasDoTenant(client, 'c-tenant');
    expect(fs).toHaveLength(1);
    expect(filtros('eq')).toContainEqual(['company_id', 'c-tenant']);
  });
  it('faturasDoTenant sem empresa → [] sem consultar', async () => {
    const { client, chamadas } = mockClient({});
    expect(await faturasDoTenant(client, '')).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });
  it('faturasDaDona / faturasDaAssinatura / getFaturaDaDona filtram pela dona', async () => {
    const m1 = mockClient({ faturas_assinatura: [{ data: [LINHA], error: null }] });
    await faturasDaDona(m1.client, 'casa');
    expect(m1.filtros('eq')).toContainEqual(['dona_company_id', 'casa']);
    const m2 = mockClient({ faturas_assinatura: [{ data: [LINHA], error: null }] });
    await faturasDaAssinatura(m2.client, 'casa', 'a1');
    expect(m2.filtros('eq')).toEqual(expect.arrayContaining([['dona_company_id', 'casa'], ['assinatura_id', 'a1']]));
    const m3 = mockClient({ faturas_assinatura: [{ data: LINHA, error: null }] });
    expect((await getFaturaDaDona(m3.client, 'casa', 'f1'))?.id).toBe('f1');
    expect(m3.filtros('eq')).toEqual(expect.arrayContaining([['dona_company_id', 'casa'], ['id', 'f1']]));
  });
  it('getFaturaPorCobranca acha pela cobrança (webhook)', async () => {
    const { client, filtros } = mockClient({ faturas_assinatura: [{ data: LINHA, error: null }] });
    expect((await getFaturaPorCobranca(client, 'cob-1'))?.id).toBe('f1');
    expect(filtros('eq')).toContainEqual(['cobranca_id', 'cob-1']);
  });
  it('salvarCobrancaDaFatura grava cobrança + link', async () => {
    const { client, chamadas } = mockClient({ faturas_assinatura: [{ data: null, error: null }] });
    await salvarCobrancaDaFatura(client, 'f1', 'cob-1', 'https://checkout.exemplo.invalid/x');
    expect(chamadas.find((c) => c.op === 'update')!.args[0]).toEqual({ cobranca_id: 'cob-1', link_url: 'https://checkout.exemplo.invalid/x' });
  });
});

describe('reservarExecucaoDoDia (trava entre servidores/deploys)', () => {
  it('garante a linha e só um servidor troca o valor pro dia de hoje', async () => {
    const { client, chamadas, filtros } = mockClient({ app_flags: [{ data: null, error: null }, { data: [{ key: 'k' }], error: null }] });
    expect(await reservarExecucaoDoDia(client, 'k', '2026-10-07')).toBe(true);
    const up = chamadas.find((c) => c.op === 'upsert')!;
    expect(up.args[1]).toMatchObject({ onConflict: 'key', ignoreDuplicates: true });
    expect(filtros('neq')).toContainEqual(['value', '2026-10-07']);
  });
  it('outro servidor já rodou hoje → false', async () => {
    const { client } = mockClient({ app_flags: [{ data: null, error: null }, { data: [], error: null }] });
    expect(await reservarExecucaoDoDia(client, 'k', '2026-10-07')).toBe(false);
  });
  it('erro no banco → false (na dúvida não roda; a idempotência das faturas segura)', async () => {
    const { client } = mockClient({ app_flags: [{ data: null, error: null }, { data: null, error: { message: 'down' } }] });
    expect(await reservarExecucaoDoDia(client, 'k', '2026-10-07')).toBe(false);
  });
});

describe('vincularCobrancaSeLivre (corrida entre servidores)', () => {
  it('só prende se a fatura ainda não tem cobrança', async () => {
    const { vincularCobrancaSeLivre } = await import('../src/modules/cobranca-recorrente/faturas-repo.js');
    const ganhou = mockClient({ faturas_assinatura: [{ data: [{ id: 'f1' }], error: null }] });
    expect(await vincularCobrancaSeLivre(ganhou.client, 'f1', 'cob-1')).toBe(true);
    expect(ganhou.filtros('is')).toContainEqual(['cobranca_id', null]);
    const perdeu = mockClient({ faturas_assinatura: [{ data: [], error: null }] });
    expect(await vincularCobrancaSeLivre(perdeu.client, 'f1', 'cob-2')).toBe(false);
  });
});
