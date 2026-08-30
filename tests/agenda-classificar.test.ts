// tests/agenda-classificar.test.ts — classificador empresa×pessoal (Eva Agenda A1).
// Regras em ordem: (1) palavra-chave de negócio OU nome de lead → empresa;
// (2) palavra-chave pessoal → pessoal; (3) fallback por horário comercial.
import { describe, it, expect } from 'vitest';
import { classificar } from '../src/modules/agenda/classificar.js';

describe('agenda/classificar: classificar()', () => {
  it('1) palavra-chave de negócio "visita" → empresa', () => {
    expect(classificar('Visita ao cliente', '2026-08-30T09:00:00-03:00', [])).toBe('empresa');
  });

  it('2) palavra-chave de negócio acentuada "orçamento" → empresa', () => {
    expect(classificar('Orçamento kit', '2026-08-30T09:00:00-03:00', [])).toBe('empresa');
  });

  it('3) palavra-chave de negócio sem acento no título "orcamento" → empresa', () => {
    expect(classificar('Fechar orcamento', '2026-08-30T09:00:00-03:00', [])).toBe('empresa');
  });

  it('4) nome de lead no título → empresa mesmo sem palavra-chave', () => {
    expect(classificar('Cyntia às 9h', '2026-08-30T09:00:00-03:00', ['Cyntia', 'Renato'])).toBe('empresa');
  });

  it('5) nome de lead acento-insensível e case-insensível → empresa', () => {
    expect(classificar('cynthia amanhã', '2026-08-30T20:00:00-03:00', ['Cynthia Alves'])).toBe('empresa');
  });

  it('6) palavra-chave pessoal "médico" → pessoal', () => {
    expect(classificar('Médico', '2026-08-30T09:00:00-03:00', [])).toBe('pessoal');
  });

  it('7) palavra-chave pessoal sem acento "medico" → pessoal mesmo em horário comercial', () => {
    expect(classificar('Consulta medico', '2026-08-31T10:00:00-03:00', [])).toBe('pessoal');
  });

  it('8) palavra-chave pessoal "aniversário" → pessoal', () => {
    expect(classificar('Aniversário da Maria', '2026-08-30T15:00:00-03:00', [])).toBe('pessoal');
  });

  it('9) fallback: título neutro em dia útil 08h-18h59 → empresa', () => {
    // 2026-08-31 é segunda-feira
    expect(classificar('Reunião X', '2026-08-31T14:00:00-03:00', [])).toBe('empresa');
  });

  it('10) "reunião" já é palavra-chave de negócio → empresa mesmo à noite', () => {
    expect(classificar('Reunião com fornecedor', '2026-08-31T21:00:00-03:00', [])).toBe('empresa');
  });

  it('11) fallback: título neutro em dia útil à noite (fora 08-18h59) → pessoal', () => {
    // 2026-08-31 segunda, 20h
    expect(classificar('Compromisso qualquer', '2026-08-31T20:00:00-03:00', [])).toBe('pessoal');
  });

  it('12) fallback: título neutro no sábado → pessoal mesmo de manhã', () => {
    // 2026-08-29 é sábado
    expect(classificar('Compromisso qualquer', '2026-08-29T09:00:00-03:00', [])).toBe('pessoal');
  });

  it('13) fallback: título neutro no domingo → pessoal', () => {
    // 2026-08-30 é domingo
    expect(classificar('Compromisso qualquer', '2026-08-30T11:00:00-03:00', [])).toBe('pessoal');
  });

  it('14) fallback: exatamente 08:00 em dia útil → empresa (limite inferior inclusivo)', () => {
    expect(classificar('Compromisso qualquer', '2026-08-31T08:00:00-03:00', [])).toBe('empresa');
  });

  it('15) fallback: exatamente 18:59 em dia útil → empresa (limite superior inclusivo)', () => {
    expect(classificar('Compromisso qualquer', '2026-08-31T18:59:00-03:00', [])).toBe('empresa');
  });

  it('16) fallback: 19:00 em dia útil → pessoal (já fora da faixa)', () => {
    expect(classificar('Compromisso qualquer', '2026-08-31T19:00:00-03:00', [])).toBe('pessoal');
  });

  it('17) palavra-chave de negócio tem prioridade sobre lead ausente e horário', () => {
    expect(classificar('Manutenção usina', '2026-08-30T22:00:00-03:00', [])).toBe('empresa');
  });
});
