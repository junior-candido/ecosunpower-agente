// tests/rh-validacao.test.ts
import { describe, it, expect } from 'vitest';
import { validarCandidatura } from '../src/modules/rh/validacao.js';

const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100, 1)]);
const base = { nome: 'João da Silva', telefone: '61 99880-5002', email: 'j@x.com', vagaId: '', consentimento: '1', website: '' };

describe('validarCandidatura', () => {
  it('aceita candidatura válida com PDF de verdade e normaliza o telefone', () => {
    const r = validarCandidatura(base, pdfBuf, 'curriculo.pdf');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.telefone).toBe('5561998805002');
      expect(r.dados.vagaId).toBeNull(); // '' = banco de talentos
    }
  });

  it('recusa arquivo que não é PDF (magic bytes), mesmo com nome .pdf', () => {
    const r = validarCandidatura(base, Buffer.from('nao sou pdf'), 'curriculo.pdf');
    expect(r.ok).toBe(false);
  });

  it('recusa sem consentimento, sem nome ou telefone inválido', () => {
    expect(validarCandidatura({ ...base, consentimento: '' }, pdfBuf, 'c.pdf').ok).toBe(false);
    expect(validarCandidatura({ ...base, nome: ' ' }, pdfBuf, 'c.pdf').ok).toBe(false);
    expect(validarCandidatura({ ...base, telefone: '123' }, pdfBuf, 'c.pdf').ok).toBe(false);
  });

  it('recusa sem arquivo', () => {
    expect(validarCandidatura(base, null, '').ok).toBe(false);
    expect(validarCandidatura(base, Buffer.alloc(0), 'c.pdf').ok).toBe(false);
  });

  it('honeypot preenchido (campo website) = spam, recusa marcando spam', () => {
    const r = validarCandidatura({ ...base, website: 'http://spam' }, pdfBuf, 'c.pdf');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.spam).toBe(true);
  });

  it('PDF acima de 5MB é recusado', () => {
    const grande = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024 + 1)]);
    expect(validarCandidatura(base, grande, 'c.pdf').ok).toBe(false);
  });

  it('vaga escolhida vem no resultado', () => {
    const r = validarCandidatura({ ...base, vagaId: 'abc-123' }, pdfBuf, 'c.pdf');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados.vagaId).toBe('abc-123');
  });
});
