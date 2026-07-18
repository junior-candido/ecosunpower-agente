// tests/dashboard-auth-token.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { gerarTokenSessao, lerUserIdDoToken } from '../src/modules/dashboard/auth.js';

beforeAll(() => { process.env.META_APP_SECRET = 'segredo-de-teste-bem-longo-123456'; });

describe('token de sessão com user_id', () => {
  it('gera e recupera o user_id', () => {
    const token = gerarTokenSessao('user-42');
    expect(lerUserIdDoToken(token)).toBe('user-42');
  });
  it('token adulterado é rejeitado', () => {
    const token = gerarTokenSessao('user-42');
    const adulterado = token.replace('user-42', 'user-99');
    expect(lerUserIdDoToken(adulterado)).toBeNull();
  });
  it('token mal-formado é rejeitado', () => {
    expect(lerUserIdDoToken('lixo')).toBeNull();
    expect(lerUserIdDoToken('')).toBeNull();
  });
});

describe('getSecret — falha-fechado (sem fallback fraco hard-coded)', () => {
  it('sem META_APP_SECRET e sem DASHBOARD_PASSWORD, gerarTokenSessao lança erro mencionando "segredo"', () => {
    const metaOrig = process.env.META_APP_SECRET;
    const dashOrig = process.env.DASHBOARD_PASSWORD;
    delete process.env.META_APP_SECRET;
    delete process.env.DASHBOARD_PASSWORD;
    try {
      expect(() => gerarTokenSessao('user-42')).toThrow(/segredo/i);
    } finally {
      // restaura pro resto da suite (beforeAll roda só uma vez por arquivo)
      if (metaOrig === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = metaOrig;
      if (dashOrig === undefined) delete process.env.DASHBOARD_PASSWORD; else process.env.DASHBOARD_PASSWORD = dashOrig;
    }
  });
});

describe('setSessionCookie — manter conectado (checkbox do login)', () => {
  function fakeRes() {
    const headers: Record<string, string> = {};
    return {
      headers,
      setHeader(nome: string, valor: string) { headers[nome] = valor; },
    };
  }

  it('padrão (manter=true): cookie persistente com Max-Age de 60 dias', async () => {
    const { setSessionCookie } = await import('../src/modules/dashboard/auth.js');
    const res = fakeRes();
    setSessionCookie(res as never, 'user-42');
    expect(res.headers['Set-Cookie']).toContain(`Max-Age=${60 * 24 * 60 * 60}`);
  });

  it('manter=false: cookie de sessão (SEM Max-Age — morre ao fechar o navegador)', async () => {
    const { setSessionCookie } = await import('../src/modules/dashboard/auth.js');
    const res = fakeRes();
    setSessionCookie(res as never, 'user-42', false);
    expect(res.headers['Set-Cookie']).not.toContain('Max-Age');
    expect(res.headers['Set-Cookie']).toContain('ecosun_dash_token=');
    expect(res.headers['Set-Cookie']).toContain('HttpOnly');
  });
});
