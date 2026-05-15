import { describe, it, expect } from 'vitest';
import { formatPhoneBR, normalizeBrazilianPhone } from '../src/modules/meta-leadgen.js';
import { maskPhone } from '../src/modules/dashboard/cadencia-views.js';

// Regressao: WhatsApp Brasil manda wa_id de celular SEM o 9o digito
// (12 digitos: 556193302673). Antes, o display fatiava os ultimos 11 sem
// normalizar e mostrava "(56) 19330-2673" — DDD invalido, nao discavel.
// formatPhoneBR deve normalizar (inserir o 9) ANTES de formatar.
describe('formatPhoneBR', () => {
  it('conserta wa_id BR sem o 9o digito (bug Carol: era (56) 19330-2673)', () => {
    expect(formatPhoneBR('556193302673')).toBe('(61) 99330-2673');
  });

  it('NUNCA produz DDD 56 (sintoma do bug) pra entrada sem o 9', () => {
    expect(formatPhoneBR('556193302673')).not.toContain('(56)');
    expect(formatPhoneBR('556198643751')).toBe('(61) 99864-3751'); // Alvaro
    expect(formatPhoneBR('556184293821')).toBe('(61) 98429-3821'); // Marcio
  });

  it('mantem numero ja completo (13 digitos, ex Jucelda)', () => {
    expect(formatPhoneBR('5561999674200')).toBe('(61) 99967-4200');
  });

  it('aceita entrada formatada/suja', () => {
    expect(formatPhoneBR('+55 (61) 99330-2673')).toBe('(61) 99330-2673');
  });

  it('formata fixo (12 digitos, nao insere 9)', () => {
    expect(formatPhoneBR('556133214567')).toBe('(61) 3321-4567');
  });

  it('aceita local sem codigo de pais', () => {
    expect(formatPhoneBR('61993302673')).toBe('(61) 99330-2673'); // celular 11
    expect(formatPhoneBR('6133214567')).toBe('(61) 3321-4567');   // fixo 10
  });

  it('degrada com graca em lixo (nao lanca, nao quebra display)', () => {
    expect(formatPhoneBR('123')).toBe('123');
    expect(formatPhoneBR('')).toBe('');
  });

  it('caminho de fallback: 11+ digitos nao normalizaveis nao lancam', () => {
    // 14 digitos, normalizeBrazilianPhone retorna null -> formata os ultimos 11
    expect(formatPhoneBR('12345678901234')).toBe('(45) 67890-1234');
  });
});

// maskPhone (cadencia-views) foi reescrito a mao com estilo +55 — pin do
// comportamento, incl. o nono digito e o fallback de < 10.
describe('maskPhone (dashboard/cadencia)', () => {
  it('conserta wa_id BR sem o 9o digito mantendo estilo +55', () => {
    expect(maskPhone('556193302673')).toBe('+55 61 99330-2673');
  });

  it('mantem numero ja completo', () => {
    expect(maskPhone('5561999674200')).toBe('+55 61 99967-4200');
  });

  it('retorna a entrada original quando curta demais', () => {
    expect(maskPhone('123')).toBe('123');
  });
});

// Sanidade: a funcao base ja resolve o "nono digito" — o bug era ela
// nao ser chamada na camada de exibicao.
describe('normalizeBrazilianPhone (sanidade do nono digito)', () => {
  it('insere o 9 em celular BR de 12 digitos', () => {
    expect(normalizeBrazilianPhone('556193302673')).toBe('5561993302673');
  });
});
