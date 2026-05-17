import { describe, it, expect } from 'vitest';
import { motivoEscalonamento } from '../src/modules/eva-alerts.js';

describe('motivoEscalonamento', () => {
  it('urgência explícita escala', () => {
    expect(motivoEscalonamento({ text: 'quero fechar hoje', contaMensal: 800 })).toBe('urgencia');
    expect(motivoEscalonamento({ text: 'já tô decidido, bora', contaMensal: 800 })).toBe('urgencia');
  });
  it('conta alta escala', () => {
    expect(motivoEscalonamento({ text: 'oi', contaMensal: 16000 })).toBe('conta_alta');
  });
  it('concorrente com proposta escala', () => {
    expect(motivoEscalonamento({ text: 'tenho uma proposta da outra empresa aqui', contaMensal: 900 })).toBe('concorrente');
  });
  it('hostilidade escala', () => {
    expect(motivoEscalonamento({ text: 'isso é golpe, parem de me encher', contaMensal: 900 })).toBe('hostilidade');
  });
  it('conversa normal NÃO escala', () => {
    expect(motivoEscalonamento({ text: 'quanto economizo por mês?', contaMensal: 900 })).toBeNull();
  });
  it('first-match-wins: urgência tem prioridade sobre hostilidade', () => {
    // mensagem casa urgencia E hostilidade; ordem dos ifs decide -> urgencia
    expect(motivoEscalonamento({ text: 'isso é golpe mas quero fechar agora' })).toBe('urgencia');
  });
});
