// src/modules/financeiro/fiscal/crypto-cert.ts
// Cifra AES-256-GCM pro .pfx e pra senha do certificado. A chave vem do env
// FISCAL_CERT_KEY (64 hex). Formato do texto cifrado: base64(iv|tag|dados).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function chave(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex ?? '')) throw new Error('FISCAL_CERT_KEY inválida: precisa de 64 caracteres hex (32 bytes).');
  return Buffer.from(hex, 'hex');
}

export function cifrar(dado: Buffer, keyHex: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(keyHex), iv);
  const corpo = Buffer.concat([c.update(dado), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64');
}

export function decifrar(cifradoB64: string, keyHex: string): Buffer {
  const tudo = Buffer.from(cifradoB64, 'base64');
  const iv = tudo.subarray(0, 12), tag = tudo.subarray(12, 28), corpo = tudo.subarray(28);
  const d = createDecipheriv('aes-256-gcm', chave(keyHex), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(corpo), d.final()]);
}
