// tests/fiscal-crypto-cert.test.ts
import { describe, it, expect } from 'vitest';
import { cifrar, decifrar } from '../src/modules/financeiro/fiscal/crypto-cert.js';

const KEY = 'a'.repeat(64); // 32 bytes em hex

describe('crypto-cert', () => {
  it('cifra e decifra buffer (roundtrip)', () => {
    const dado = Buffer.from('conteudo do pfx');
    const cifrado = cifrar(dado, KEY);
    expect(cifrado).not.toContain('conteudo');
    expect(decifrar(cifrado, KEY).toString()).toBe('conteudo do pfx');
  });
  it('chave errada não decifra', () => {
    const cifrado = cifrar(Buffer.from('x'), KEY);
    expect(() => decifrar(cifrado, 'b'.repeat(64))).toThrow();
  });
  it('rejeita chave com tamanho errado', () => {
    expect(() => cifrar(Buffer.from('x'), 'curta')).toThrow(/FISCAL_CERT_KEY/);
  });
});
