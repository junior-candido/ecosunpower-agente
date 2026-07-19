import { describe, it, expect, vi } from 'vitest';
import { criarTenantResolver, ECOSUN_COMPANY_ID } from '../src/modules/tenant-resolver.js';

// Fake client que imita a cadeia from().select().eq().maybeSingle().
// `result` é o que maybeSingle() resolve; `calls` conta quantas queries saíram.
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls = { from: 0 };
  const client = {
    from(_table: string) {
      calls.from++;
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return result; },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

describe('tenant-resolver', () => {
  it('número mapeado → retorna a empresa do mapa', async () => {
    const { client } = fakeClient({ data: { id: 'empresa-2' }, error: null });
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('999888777')).toBe('empresa-2');
  });

  it('número não-mapeado (data null) → EcoSun', async () => {
    const { client } = fakeClient({ data: null, error: null });
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('numero-desconhecido')).toBe(ECOSUN_COMPANY_ID);
  });

  it('phoneNumberId undefined → EcoSun SEM bater no banco', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero(undefined)).toBe(ECOSUN_COMPANY_ID);
    expect(calls.from).toBe(0);
  });

  it('erro de banco → EcoSun (best-effort, mensagem nunca cai)', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('999')).toBe(ECOSUN_COMPANY_ID);
    warn.mockRestore();
  });

  it('cache: 2ª chamada pro mesmo número não bate no banco de novo', async () => {
    const { client, calls } = fakeClient({ data: { id: 'empresa-2' }, error: null });
    const r = criarTenantResolver(client);
    expect(await r.companyDoNumero('mesmo-numero')).toBe('empresa-2');
    expect(await r.companyDoNumero('mesmo-numero')).toBe('empresa-2');
    expect(calls.from).toBe(1);
  });
});
