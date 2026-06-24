// tests/dashboard-password.test.ts
import { describe, it, expect } from 'vitest';
import { hashSenha, verificarSenha } from '../src/modules/dashboard/password.js';

describe('hash de senha', () => {
  it('hash bate com a senha certa e falha com a errada', async () => {
    const hash = await hashSenha('senha-forte-123');
    expect(hash).not.toBe('senha-forte-123');
    expect(await verificarSenha('senha-forte-123', hash)).toBe(true);
    expect(await verificarSenha('errada', hash)).toBe(false);
  });
  it('verificarSenha com hash nulo retorna false', async () => {
    expect(await verificarSenha('qualquer', null)).toBe(false);
  });
});
