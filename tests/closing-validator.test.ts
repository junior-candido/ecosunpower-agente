// tests/closing-validator.test.ts
import { describe, it, expect } from 'vitest';
import {
  isValidCPF,
  isValidCNPJ,
  isValidCEP,
  isValidEmail,
  isValidPhoneBR,
  formatCPF,
  formatCEP,
  formatPhoneBR,
} from '../src/modules/closing/closing-validator.js';

describe('closing-validator primitives', () => {
  it('isValidCPF aceita 11 dígitos com ou sem máscara', () => {
    expect(isValidCPF('028.876.121-90')).toBe(true);
    expect(isValidCPF('02887612190')).toBe(true);
  });

  it('isValidCPF rejeita comprimento errado', () => {
    expect(isValidCPF('123')).toBe(false);
    expect(isValidCPF('028876121901234')).toBe(false);
  });

  it('isValidCNPJ aceita 14 dígitos', () => {
    expect(isValidCNPJ('33.020.459/0001-06')).toBe(true);
    expect(isValidCNPJ('33020459000106')).toBe(true);
  });

  it('isValidCEP aceita 8 dígitos', () => {
    expect(isValidCEP('72910-000')).toBe(true);
    expect(isValidCEP('72910000')).toBe(true);
    expect(isValidCEP('7291000')).toBe(false);
  });

  it('isValidEmail aceita formato básico', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('acmanutencaodf@hotmail.com')).toBe(true);
    expect(isValidEmail('inválido')).toBe(false);
  });

  it('isValidPhoneBR aceita DDD + 8/9 dígitos', () => {
    expect(isValidPhoneBR('(61) 99289-1958')).toBe(true);
    expect(isValidPhoneBR('61992891958')).toBe(true);
    expect(isValidPhoneBR('+5561992891958')).toBe(true);
    expect(isValidPhoneBR('123')).toBe(false);
  });

  it('formatCPF, formatCEP, formatPhoneBR aplicam máscara padrão', () => {
    expect(formatCPF('02887612190')).toBe('028.876.121-90');
    expect(formatCEP('72910000')).toBe('72910-000');
    expect(formatPhoneBR('61992891958')).toBe('(61) 99289-1958');
  });
});
