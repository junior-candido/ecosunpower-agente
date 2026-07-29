// Peça 1 pagamento (InfinitePay) — pontas soltas da página Cobrar:
// achar o lead pelo TELEFONE digitado (a etiqueta do campo promete "vincula
// ao lead" — então tem que vincular de verdade, com dedup do 9º dígito).
import { describe, it, expect } from 'vitest';
import { acharLeadPorTelefone } from '../src/modules/dashboard/cobrancas-store.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

// Mock chainable do supabase-js (mesmo estilo dos testes de empresas):
// grava os filtros usados e devolve a resposta programada.
function mockClient(resposta: { data: unknown; error: { message: string } | null }) {
  const filtros: { in?: [string, string[]]; eq?: [string, string] } = {};
  const chain: any = {
    select() { return chain; },
    in(col: string, vals: string[]) { filtros.in = [col, vals]; return chain; },
    eq(col: string, val: string) { filtros.eq = [col, val]; return chain; },
    order() { return chain; },
    limit() { return chain; },
    then(res: any, rej: any) { return Promise.resolve(resposta).then(res, rej); },
  };
  const client = { from: (tabela: string) => { filtros.eq ??= undefined as any; (filtros as any).tabela = tabela; return chain; } };
  return { client: client as any, filtros: filtros as any };
}

describe('acharLeadPorTelefone', () => {
  it('acha o lead por QUALQUER variante do número (9º dígito / 55) na empresa certa', async () => {
    const { client, filtros } = mockClient({
      data: [{ id: 'lead-1', name: 'Superbom', email: 's@x.com', phone: '5561999998888' }],
      error: null,
    });
    const lead = await acharLeadPorTelefone(client, ECOSUN, '61 99999-8888');
    expect(lead).toEqual({ id: 'lead-1', nome: 'Superbom', email: 's@x.com', telefone: '5561999998888' });
    expect(filtros.tabela).toBe('leads');
    expect(filtros.in?.[0]).toBe('phone');
    expect(filtros.in?.[1]).toContain('5561999998888'); // variante com 55+9º dígito
    expect(filtros.eq).toEqual(['company_id', ECOSUN]); // nunca vaza lead de outra empresa
  });

  it('não achou → null (sem erro)', async () => {
    const { client } = mockClient({ data: [], error: null });
    expect(await acharLeadPorTelefone(client, ECOSUN, '61 99999-8888')).toBeNull();
  });

  it('telefone inválido/curto → null SEM consultar o banco', async () => {
    let consultou = false;
    const client = { from() { consultou = true; throw new Error('não devia consultar'); } };
    expect(await acharLeadPorTelefone(client as any, ECOSUN, 'abc')).toBeNull();
    expect(consultou).toBe(false);
  });

  it('erro do banco → null (cobrança segue sem vínculo, não quebra)', async () => {
    const { client } = mockClient({ data: null, error: { message: 'boom' } });
    expect(await acharLeadPorTelefone(client, ECOSUN, '61 99999-8888')).toBeNull();
  });
});
