import { describe, it, expect } from 'vitest';
import { hojeEmBrasilia, dataIsoEmBrasilia, dataPorExtenso } from '../src/modules/closing/data-documento.js';

// A data impressa no contrato/procuração é a de BRASÍLIA — não a do servidor (UTC).
// Às 22:30 em Brasília o servidor já está no dia seguinte; o documento não pode
// sair com a data de amanhã.
describe('data do documento (America/Sao_Paulo)', () => {
  it('22:30 em Brasília (01:30 UTC do dia seguinte) → ainda é o dia de Brasília', () => {
    const agora = new Date('2026-09-28T01:30:00Z'); // 27/09 22:30 BRT
    expect(hojeEmBrasilia(agora)).toBe('2026-09-27');
  });

  it('meio-dia normal', () => {
    expect(hojeEmBrasilia(new Date('2026-09-27T15:00:00Z'))).toBe('2026-09-27');
  });

  it('virada do ano: 31/12 23:00 BRT = 01/01 02:00 UTC', () => {
    expect(hojeEmBrasilia(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31');
  });

  it('timestamp do congelamento (ISO com hora) vira a data de Brasília', () => {
    expect(dataIsoEmBrasilia('2026-07-14T01:30:00Z')).toBe('2026-07-13');
    expect(dataIsoEmBrasilia('2026-07-13T10:01:00+00:00')).toBe('2026-07-13');
  });

  it('data sem hora passa direto (não volta 1 dia por fuso)', () => {
    expect(dataIsoEmBrasilia('2026-07-13')).toBe('2026-07-13');
  });

  it('lixo → null', () => {
    expect(dataIsoEmBrasilia('')).toBeNull();
    expect(dataIsoEmBrasilia('ontem')).toBeNull();
    expect(dataIsoEmBrasilia(undefined)).toBeNull();
  });

  it('por extenso, sem passar por fuso nenhum', () => {
    expect(dataPorExtenso('2026-09-27')).toBe('27 de setembro de 2026');
    expect(dataPorExtenso('2026-03-01')).toBe('1 de março de 2026');
  });
});
