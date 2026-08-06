// usuarioPorTelefone — acha quem já tem cadastro pelo zap (📤 enviar pelo zap).
import { describe, it, expect } from 'vitest';
import { usuarioPorTelefone, telefoneDoUsuario } from '../src/modules/dashboard/users-store.js';

function mockClient(resposta: any) {
  const eqs: [string, unknown][] = [];
  const chain: any = {
    select() { return chain; },
    eq(col: string, val: unknown) { eqs.push([col, val]); return chain; },
    maybeSingle() { return Promise.resolve({ data: resposta, error: null }); },
  };
  return { client: { from: () => chain } as any, eqs };
}

describe('usuarioPorTelefone', () => {
  it('filtra por empresa + telefone e devolve id/nome/ativo', async () => {
    const { client, eqs } = mockClient({ id: 'u1', nome: 'João', ativo: false });
    const u = await usuarioPorTelefone(client, 'c1', '5561999998888');
    expect(u).toEqual({ id: 'u1', nome: 'João', ativo: false });
    expect(eqs).toContainEqual(['company_id', 'c1']);
    expect(eqs).toContainEqual(['telefone', '5561999998888']);
  });
  it('sem cadastro → null', async () => {
    const { client } = mockClient(null);
    expect(await usuarioPorTelefone(client, 'c1', '556100000000')).toBeNull();
  });
});

// Bug 05/08: telefone salvo SEM o 55 (ex.: Claudson '61996688219') ia cru pra
// API do WhatsApp e o aviso de serviço morria em silêncio. telefoneDoUsuario
// agora devolve SEMPRE a forma pronta pra envio (com país).
describe('telefoneDoUsuario — normaliza pro envio', () => {
  it('sem o 55 (DDD + 9 dígitos) → completa o país', async () => {
    const { client } = mockClient({ telefone: '61996688219' });
    expect(await telefoneDoUsuario(client, 'u1')).toBe('5561996688219');
  });
  it('com máscara ((61) 99668-8219) → só dígitos + país', async () => {
    const { client } = mockClient({ telefone: '(61) 99668-8219' });
    expect(await telefoneDoUsuario(client, 'u1')).toBe('5561996688219');
  });
  it('já com 55 → mantém como está', async () => {
    const { client } = mockClient({ telefone: '5561996688219' });
    expect(await telefoneDoUsuario(client, 'u1')).toBe('5561996688219');
  });
  it('fixo com DDD (10 dígitos) → também ganha o 55', async () => {
    const { client } = mockClient({ telefone: '6133334444' });
    expect(await telefoneDoUsuario(client, 'u1')).toBe('556133334444');
  });
  it('vazio/null → null', async () => {
    const { client } = mockClient({ telefone: null });
    expect(await telefoneDoUsuario(client, 'u1')).toBeNull();
  });
});

// B.O. 06/08: Jota respondeu o aviso e a Eva tratou como LEAD QUENTE.
// ehTelefoneDaEquipe = vacina (Eva muda pra número de Usuários).
describe('ehTelefoneDaEquipe', () => {
  function clientEquipe(acha: boolean) {
    return {
      from: () => ({ select: () => ({ in: () => ({ limit: async () => ({ data: acha ? [{ id: 'u1' }] : [] }) }) }) }),
    } as any;
  }
  it('número da equipe (mesmo sem o 55 no cadastro) → true', async () => {
    const { ehTelefoneDaEquipe } = await import('../src/modules/dashboard/users-store.js');
    expect(await ehTelefoneDaEquipe(clientEquipe(true), '5561996688219')).toBe(true);
  });
  it('número desconhecido → false', async () => {
    const { ehTelefoneDaEquipe } = await import('../src/modules/dashboard/users-store.js');
    expect(await ehTelefoneDaEquipe(clientEquipe(false), '5561900000000')).toBe(false);
  });
  it('vazio → false sem consultar', async () => {
    const { ehTelefoneDaEquipe } = await import('../src/modules/dashboard/users-store.js');
    expect(await ehTelefoneDaEquipe(clientEquipe(true), '')).toBe(false);
  });
});
