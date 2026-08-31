// tests/fiscal-certificado.test.ts
import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import { abrirPfx, salvarCertificado } from '../src/modules/financeiro/fiscal/certificado.js';

function pfxDeTeste(senha: string, cn: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

describe('certificado', () => {
  it('abre pfx com a senha certa e extrai pems + validade', () => {
    const pfx = pfxDeTeste('1234', 'ECOSUNPOWER ENERGIA SOLAR LTDA:33020459000106');
    const c = abrirPfx(pfx, '1234');
    expect(c.certPem).toContain('BEGIN CERTIFICATE');
    expect(c.keyPem).toMatch(/BEGIN (RSA )?PRIVATE KEY/);
    expect(c.validade.getTime()).toBeGreaterThan(Date.now());
    expect(c.cnpj).toBe('33020459000106');
  });
  it('senha errada dá erro claro em PT', () => {
    const pfx = pfxDeTeste('1234', 'X');
    expect(() => abrirPfx(pfx, 'errada')).toThrow(/senha/i);
  });
  it('salvarCertificado valida a senha antes de guardar', async () => {
    const pfx = pfxDeTeste('1234', 'X');
    const client = { storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) } as never;
    await expect(salvarCertificado(client, 'c1', pfx, 'senha-errada', 'a'.repeat(64))).rejects.toThrow(/senha/i);
  });
});
