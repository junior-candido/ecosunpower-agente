import { describe, it, expect } from 'vitest';
import { camposVaziosUsina, proximoCampoNovo, perguntaNovo, perguntaUsina, campoObrigatorioNovo } from '../src/modules/monitoring/dono-cad/machine.js';

describe('camposVaziosUsina', () => {
  it('retorna só os campos vazios, na ordem', () => {
    const sistema = { apelido: 'Casa', potencia_kwp: null, cidade: '', uf: 'DF', data_instalacao: null, inversor_modelo: null, observacoes: 'ok' };
    expect(camposVaziosUsina(sistema)).toEqual(['potencia_kwp', 'cidade', 'data_instalacao', 'inversor_modelo']);
  });
  it('usina cheia retorna vazio', () => {
    const sistema = { apelido: 'Casa', potencia_kwp: 8.2, cidade: 'Bsb', uf: 'DF', data_instalacao: '2025-01-01', inversor_modelo: 'SG5', observacoes: 'x' };
    expect(camposVaziosUsina(sistema)).toEqual([]);
  });
});

describe('proximoCampoNovo', () => {
  it('avança na ordem name→phone→email→city→uf→cep→fim', () => {
    expect(proximoCampoNovo('name')).toBe('phone');
    expect(proximoCampoNovo('phone')).toBe('email');
    expect(proximoCampoNovo('cep')).toBe('fim');
  });
});

describe('campoObrigatorioNovo', () => {
  it('name e phone são obrigatórios; resto não', () => {
    expect(campoObrigatorioNovo('name')).toBe(true);
    expect(campoObrigatorioNovo('phone')).toBe(true);
    expect(campoObrigatorioNovo('email')).toBe(false);
    expect(campoObrigatorioNovo('cep')).toBe(false);
  });
});

describe('perguntas', () => {
  it('cada campo tem pergunta em PT', () => {
    expect(perguntaNovo('name')).toMatch(/nome/i);
    expect(perguntaUsina('potencia_kwp')).toMatch(/pot[êe]ncia/i);
  });
});
