// variantesTelefone: gera as formas plausíveis do MESMO celular brasileiro
// (ambiguidade do 9º dígito + país 55), pra achar o lead e não duplicar.
import { describe, it, expect } from 'vitest';
import { variantesTelefone, telefoneParaEnvio } from '../src/modules/phone.js';

describe('variantesTelefone', () => {
  it('número com 9 (13 díg) também gera a forma sem 9 (12 díg)', () => {
    const v = variantesTelefone('5561987654321');
    expect(v).toContain('5561987654321'); // com 9
    expect(v).toContain('556187654321');  // sem 9
  });

  it('número sem 9 (12 díg) também gera a forma com 9 (13 díg)', () => {
    const v = variantesTelefone('556187654321');
    expect(v).toContain('556187654321');  // sem 9
    expect(v).toContain('5561987654321'); // com 9
  });

  it('número sem o país (11 díg) gera as formas com 55 (pra casar lead salvo com país)', () => {
    const v = variantesTelefone('61987654321');
    expect(v).toContain('5561987654321'); // com 55 + com 9
    expect(v).toContain('556187654321');  // com 55 + sem 9
  });

  it('limpa máscara (parênteses, traço, espaço) antes de comparar', () => {
    const v = variantesTelefone('+55 (61) 98765-4321');
    expect(v).toContain('5561987654321');
    expect(v).toContain('556187654321');
  });

  it('vazio ou lixo não quebra', () => {
    expect(variantesTelefone('')).toEqual([]);
    expect(variantesTelefone('   ')).toEqual([]);
    expect(variantesTelefone('abc')).toEqual([]);
  });

  it('não inventa variante pra coisa que não é celular BR reconhecível', () => {
    // 9 dígitos soltos: devolve só ele mesmo, sem inventar 9º dígito
    expect(variantesTelefone('123456789')).toEqual(['123456789']);
  });
});

// telefoneParaEnvio: forma única pronta pro sendText (bug 05/08 — número sem
// o 55 ia cru pra API e o zap morria em silêncio).
describe('telefoneParaEnvio', () => {
  it('completa o 55 quando vier só DDD + local', () => {
    expect(telefoneParaEnvio('61996688219')).toBe('5561996688219');
    expect(telefoneParaEnvio('6133334444')).toBe('556133334444');
  });
  it('tira máscara e espaços', () => {
    expect(telefoneParaEnvio('(61) 99668-8219')).toBe('5561996688219');
  });
  it('já com 55 fica como está', () => {
    expect(telefoneParaEnvio('5561996688219')).toBe('5561996688219');
  });
  it('vazio/nulo → null', () => {
    expect(telefoneParaEnvio('')).toBeNull();
    expect(telefoneParaEnvio('   ')).toBeNull();
  });
  it('formato não reconhecido volta só com os dígitos (não inventa)', () => {
    expect(telefoneParaEnvio('123456789')).toBe('123456789');
  });
});
