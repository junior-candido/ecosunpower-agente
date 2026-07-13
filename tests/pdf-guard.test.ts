import { describe, it, expect } from 'vitest';
import { tamanhoBase64Bytes, pdfGrandeDemais, bytesParaMB, PDF_MAX_BYTES } from '../src/modules/pdf-guard.js';

// base64 de N bytes ≈ ceil(N/3)*4 chars. Geramos uma string de tamanho
// controlado sem alocar o buffer real gigante.
function base64DeBytes(bytes: number): string {
  const chars = Math.ceil(bytes / 3) * 4;
  // usa '=' de padding coerente pra não confundir o cálculo (múltiplo de 3 → sem '=')
  const semPad = 'A'.repeat(Math.ceil(bytes / 3) * 4);
  return semPad.slice(0, chars);
}

describe('tamanhoBase64Bytes', () => {
  it('vazio/null → 0', () => {
    expect(tamanhoBase64Bytes('')).toBe(0);
    expect(tamanhoBase64Bytes(null)).toBe(0);
    expect(tamanhoBase64Bytes(undefined)).toBe(0);
  });
  it('desconta padding =', () => {
    // "TWE=" (4 chars, 1 padding) decodifica pra 2 bytes ("Ma")
    expect(tamanhoBase64Bytes('TWE=')).toBe(2);
    // "TQ==" (4 chars, 2 padding) → 1 byte ("M")
    expect(tamanhoBase64Bytes('TQ==')).toBe(1);
  });
  it('confere contra Buffer real', () => {
    const b64 = Buffer.from('conta de luz da Fernanda').toString('base64');
    expect(tamanhoBase64Bytes(b64)).toBe(Buffer.from(b64, 'base64').byteLength);
  });
});

describe('pdfGrandeDemais', () => {
  it('PDF pequeno (conta de luz) passa', () => {
    expect(pdfGrandeDemais(base64DeBytes(500 * 1024))).toBe(false); // 500KB
  });
  it('PDF gigante (catálogo/manual) é barrado', () => {
    expect(pdfGrandeDemais(base64DeBytes(20 * 1024 * 1024))).toBe(true); // 20MB
  });
  it('exatamente no limite não é barrado; 1 byte acima é', () => {
    expect(pdfGrandeDemais(base64DeBytes(PDF_MAX_BYTES))).toBe(false);
    expect(pdfGrandeDemais(base64DeBytes(PDF_MAX_BYTES + 4096))).toBe(true);
  });
  it('respeita limite custom', () => {
    expect(pdfGrandeDemais(base64DeBytes(2 * 1024 * 1024), 1024 * 1024)).toBe(true);
  });
});

describe('bytesParaMB', () => {
  it('formata em MB com 1 casa', () => {
    expect(bytesParaMB(12 * 1024 * 1024)).toBe(12);
    expect(bytesParaMB(1.5 * 1024 * 1024)).toBe(1.5);
  });
});
