import { describe, it, expect } from 'vitest';
import { renderTemplate, STEPS_JORNADA } from '../src/modules/email/templates.js';

describe('render de template', () => {
  it('substitui variaveis e injeta descadastro', () => {
    const html = renderTemplate('<p>Ola {nome} de {cidade}!</p>{link_descadastro}', {
      nome: 'Joao', cidade: 'Brasilia', o_que_pediu: 'orcamento', link_descadastro: 'https://x/u/abc',
    });
    expect(html).toContain('Ola Joao de Brasilia!');
    expect(html).toContain('https://x/u/abc');
    expect(html).not.toContain('{nome}');
  });

  it('variavel ausente vira vazio, nao quebra', () => {
    const html = renderTemplate('Oi {nome}{cidade}', { nome: 'Ana' } as any);
    expect(html).toBe('Oi Ana');
  });

  it('a jornada tem 6 steps com dias 0,2,5,10,18,30', () => {
    expect(STEPS_JORNADA.map((s) => s.dia)).toEqual([0, 2, 5, 10, 18, 30]);
  });
});
