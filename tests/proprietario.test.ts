// tests/proprietario.test.ts
import { describe, it, expect } from 'vitest';
import { buildClienteSearchFilter } from '../src/modules/dashboard/proprietario.js';
import { parseProprietarioInput } from '../src/modules/dashboard/proprietario.js';

describe('buildClienteSearchFilter', () => {
  it('retorna inválido para termo com menos de 2 chars', () => {
    expect(buildClienteSearchFilter('a').valid).toBe(false);
    expect(buildClienteSearchFilter('  ').valid).toBe(false);
  });

  it('busca por nome (ilike) com termo textual', () => {
    const r = buildClienteSearchFilter('João');
    expect(r.valid).toBe(true);
    expect(r.or).toContain('name.ilike.%João%');
  });

  it('adiciona busca por telefone quando há >=3 dígitos', () => {
    const r = buildClienteSearchFilter('5561999');
    expect(r.valid).toBe(true);
    expect(r.or).toContain('name.ilike.%5561999%');
    expect(r.or).toContain('phone.ilike.%5561999%');
  });

  it('normaliza dígitos do telefone (ignora pontuação)', () => {
    const r = buildClienteSearchFilter('(61) 99999-0000');
    expect(r.or).toContain('phone.ilike.%61999990000%');
  });
});

describe('parseProprietarioInput', () => {
  const uuid = '11111111-1111-1111-1111-111111111111';

  it('intenção "manter" quando não vem nada relevante', () => {
    expect(parseProprietarioInput({})).toEqual({ acao: 'manter' });
    expect(parseProprietarioInput({ lead_id: '' })).toEqual({ acao: 'manter' });
  });

  it('intenção "desvincular" quando flag desvincular=1', () => {
    expect(parseProprietarioInput({ desvincular: '1' })).toEqual({ acao: 'desvincular' });
  });

  it('intenção "vincular" com UUID válido', () => {
    expect(parseProprietarioInput({ lead_id: uuid })).toEqual({ acao: 'vincular', lead_id: uuid });
  });

  it('erro quando lead_id não é UUID', () => {
    const r = parseProprietarioInput({ lead_id: 'abc' });
    expect(r.acao).toBe('erro');
  });

  it('desvincular tem prioridade sobre lead_id preenchido', () => {
    expect(parseProprietarioInput({ desvincular: '1', lead_id: uuid })).toEqual({ acao: 'desvincular' });
  });
});
