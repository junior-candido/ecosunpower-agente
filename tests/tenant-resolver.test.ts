import { describe, it, expect, vi } from 'vitest';
import { criarTenantResolver, ECOSUN_COMPANY_ID } from '../src/modules/tenant-resolver.js';

// Fake client que imita DUAS queries que o resolver dispara em `companies`:
//  1. busca por número:  from().select().eq().maybeSingle()  → `lookup`
//  2. existência de mapa: from().select().not().limit()       → `mapeamentos`
// (data é uma LISTA — existeAlgumMapeamento checa data.length > 0)
function fakeClient(opts: {
  lookup: { data: unknown; error: unknown };
  mapeamentos?: { data: unknown; error: unknown };
}) {
  const mapeamentos = opts.mapeamentos ?? { data: [], error: null };
  const calls = { lookup: 0, existencia: 0 };
  const client = {
    from(_table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        not() { return builder; },
        limit() { calls.existencia++; return Promise.resolve(mapeamentos); },
        maybeSingle() { calls.lookup++; return Promise.resolve(opts.lookup); },
      };
      return builder;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

describe('tenant-resolver (fatia 2 — falha-fechado)', () => {
  it('número mapeado → empresa do mapa (motivo mapeado), e cacheia', async () => {
    const { client, calls } = fakeClient({ lookup: { data: { id: 'empresa-2' }, error: null } });
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('999888777')).toEqual({ companyId: 'empresa-2', motivo: 'mapeado' });
    // 2ª chamada não bate no banco de novo
    expect(await r.companyDoNumero('999888777')).toEqual({ companyId: 'empresa-2', motivo: 'mapeado' });
    expect(calls.lookup).toBe(1);
    expect(calls.existencia).toBe(0); // mapeado não precisa checar existência
  });

  it('phoneNumberId undefined → EcoSun (sem-numero) SEM bater no banco', async () => {
    const { client, calls } = fakeClient({ lookup: { data: null, error: null } });
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero(undefined)).toEqual({ companyId: ECOSUN_COMPANY_ID, motivo: 'sem-numero' });
    expect(calls.lookup).toBe(0);
    expect(calls.existencia).toBe(0);
  });

  it('(a) ZERO mapeamentos + não-mapeado → EcoSun (motivo nao-mapeado), lookup cacheado', async () => {
    const { client, calls } = fakeClient({
      lookup: { data: null, error: null },
      mapeamentos: { data: [], error: null }, // sistema sem nenhum mapa = mundo de hoje
    });
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('num-x')).toEqual({ companyId: ECOSUN_COMPANY_ID, motivo: 'nao-mapeado' });
    // 2ª chamada: lookup vem do cache (resposta real), existência do cache dela
    expect(await r.companyDoNumero('num-x')).toEqual({ companyId: ECOSUN_COMPANY_ID, motivo: 'nao-mapeado' });
    expect(calls.lookup).toBe(1);
  });

  it('(b) mapeamentos EXISTEM + não-mapeado → companyId null (retém)', async () => {
    const { client } = fakeClient({
      lookup: { data: null, error: null },
      mapeamentos: { data: [{ id: 'outra-empresa' }], error: null },
    });
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('num-desconhecido')).toEqual({ companyId: null, motivo: 'nao-mapeado' });
  });

  it('(c) mapeamentos EXISTEM + erro de banco → companyId null E não cacheia (re-query)', async () => {
    const { client, calls } = fakeClient({
      lookup: { data: null, error: { message: 'boom' } },
      mapeamentos: { data: [{ id: 'outra-empresa' }], error: null },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('num-erro')).toEqual({ companyId: null, motivo: 'erro' });
    // erro NÃO é cacheado → 2ª chamada bate no banco de novo
    expect(await r.companyDoNumero('num-erro')).toEqual({ companyId: null, motivo: 'erro' });
    expect(calls.lookup).toBe(2);
    warn.mockRestore();
  });

  it('(d) ZERO mapeamentos + erro de banco → EcoSun (best-effort) E não cacheia', async () => {
    const { client, calls } = fakeClient({
      lookup: { data: null, error: { message: 'boom' } },
      mapeamentos: { data: [], error: null },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('num-erro2')).toEqual({ companyId: ECOSUN_COMPANY_ID, motivo: 'erro' });
    expect(await r.companyDoNumero('num-erro2')).toEqual({ companyId: ECOSUN_COMPANY_ID, motivo: 'erro' });
    expect(calls.lookup).toBe(2); // não cacheado
    warn.mockRestore();
  });

  it('erro ao CHECAR mapeamentos → assume mundo legado (EcoSun), nunca retém à toa', async () => {
    const { client } = fakeClient({
      lookup: { data: null, error: null },              // número não-mapeado
      mapeamentos: { data: null, error: { message: 'db down' } }, // não deu pra saber
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = criarTenantResolver(client);
    // sem conseguir provar que existem mapeamentos → NÃO retém → EcoSun
    expect(await r.companyDoNumero('num-y')).toEqual({ companyId: ECOSUN_COMPANY_ID, motivo: 'nao-mapeado' });
    warn.mockRestore();
  });
});
