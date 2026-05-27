import { describe, it, expect } from 'vitest';
import { parseClosingCommand } from '../src/modules/closing/closing-command-parser.js';

describe('parseClosingCommand', () => {
  describe('procuracao', () => {
    it('reconhece "procuracao Fernanda"', () => {
      expect(parseClosingCommand('procuracao Fernanda')).toEqual({ command: 'procuracao', name: 'Fernanda' });
    });
    it('reconhece "/procuracao Fernanda"', () => {
      expect(parseClosingCommand('/procuracao Fernanda')).toEqual({ command: 'procuracao', name: 'Fernanda' });
    });
    it('reconhece "Procuração da Fernanda" (acentos + conectivo)', () => {
      expect(parseClosingCommand('Procuração da Fernanda')).toEqual({ command: 'procuracao', name: 'Fernanda' });
    });
    it('reconhece "PROCURAÇÃO FERNANDA SILVA" maiusculo', () => {
      expect(parseClosingCommand('PROCURAÇÃO FERNANDA SILVA')).toEqual({ command: 'procuracao', name: 'FERNANDA SILVA' });
    });
    it('aceita "procuracao" sozinho (sem nome)', () => {
      expect(parseClosingCommand('procuracao')).toEqual({ command: 'procuracao', name: '' });
    });
  });

  describe('contrato', () => {
    it('reconhece variacoes', () => {
      expect(parseClosingCommand('contrato Joao')).toEqual({ command: 'contrato', name: 'Joao' });
      expect(parseClosingCommand('/contrato Joao')).toEqual({ command: 'contrato', name: 'Joao' });
      expect(parseClosingCommand('Contrato do Joao')).toEqual({ command: 'contrato', name: 'Joao' });
    });
  });

  describe('fechar', () => {
    it('reconhece variacoes (compat com /fechar atual)', () => {
      expect(parseClosingCommand('fechar Maria')).toEqual({ command: 'fechar', name: 'Maria' });
      expect(parseClosingCommand('/fechar Maria')).toEqual({ command: 'fechar', name: 'Maria' });
      expect(parseClosingCommand('Fechar a Maria')).toEqual({ command: 'fechar', name: 'Maria' });
    });
  });

  describe('nao reconhece', () => {
    it('texto qualquer retorna null', () => {
      expect(parseClosingCommand('oi tudo bem?')).toBeNull();
      expect(parseClosingCommand('quero saber o preco do kit 5kwp')).toBeNull();
    });
  });
});
