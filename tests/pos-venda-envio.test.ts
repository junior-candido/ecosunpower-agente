import { describe, it, expect } from 'vitest';
import { mapaBotaoTemplate, componenteNome, normalizarTelefone, previaTemplate } from '../src/modules/dashboard/pos-venda-envio.js';

describe('mapaBotaoTemplate', () => {
  it('mapeia os botões de template aprovado', () => {
    expect(mapaBotaoTemplate('limpeza')).toBe('lembrete_manutencao');
    expect(mapaBotaoTemplate('depoimento')).toBe('pedido_depoimento');
    expect(mapaBotaoTemplate('upgrade')).toBe('upgrade_ampliacao');
  });
  it('parabens/relatorio NÃO usam template (vão pelo copiloto com dados reais)', () => {
    expect(mapaBotaoTemplate('parabens')).toBeNull();
    expect(mapaBotaoTemplate('relatorio')).toBeNull();
  });
  it('contato não envia template (retorna null)', () => {
    expect(mapaBotaoTemplate('contato')).toBeNull();
  });
  it('tipo desconhecido retorna null', () => {
    expect(mapaBotaoTemplate('xpto')).toBeNull();
  });
});

describe('componenteNome', () => {
  it('monta o body com a variável {{1}} = nome', () => {
    expect(componenteNome('João')).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'João' }] },
    ]);
  });
  it('nome vazio cai pra "cliente" (a Meta exige a variável preenchida)', () => {
    expect(componenteNome('')).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'cliente' }] },
    ]);
  });
});

describe('normalizarTelefone', () => {
  it('tira não-dígitos e garante o 55', () => {
    expect(normalizarTelefone('(61) 99999-0000')).toBe('5561999990000');
    expect(normalizarTelefone('5561999990000')).toBe('5561999990000');
  });
  it('vazio vira string vazia', () => {
    expect(normalizarTelefone('')).toBe('');
  });
});

describe('previaTemplate', () => {
  it('substitui {nome} pelo nome do cliente', () => {
    expect(previaTemplate('limpeza', 'João')).toContain('Oi João,');
  });
  it('nome vazio vira "cliente"', () => {
    expect(previaTemplate('limpeza', '')).toContain('Oi cliente,');
  });
  it('parabens/relatorio não têm prévia de template (vão pelo copiloto)', () => {
    expect(previaTemplate('parabens', 'Ana')).toBeNull();
    expect(previaTemplate('relatorio', 'Ana')).toBeNull();
  });
  it('tipo sem texto (contato) retorna null', () => {
    expect(previaTemplate('contato', 'João')).toBeNull();
  });
});
