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
