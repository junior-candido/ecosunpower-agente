// tests/financeiro-lancamentos.test.ts
import { describe, it, expect } from 'vitest';
import {
  CATEGORIA_SLUGS, validarParaConfirmar, normalizarContraparte,
  ehDuplicado, pendenteExpirado, competenciaDe, resolverCategoria,
} from '../src/modules/financeiro/lancamentos.js';

describe('financeiro/lancamentos: categorias', () => {
  it('lista fixa tem as 13 da spec, com outros', () => {
    expect(CATEGORIA_SLUGS).toHaveLength(13);
    expect(CATEGORIA_SLUGS).toContain('combustivel');
    expect(CATEGORIA_SLUGS).toContain('outros');
  });
  it('categoria desconhecida cai em outros', () => {
    expect(resolverCategoria('jardinagem')).toBe('outros');
    expect(resolverCategoria(null)).toBe('outros');
    expect(resolverCategoria('combustivel')).toBe('combustivel');
  });
});

describe('financeiro/lancamentos: validação pra confirmar', () => {
  const ok = { tipo: 'despesa' as const, valor: 380, data_evento: '2026-06-11', pf_pj: 'PJ' as const };
  it('FRONTEIRA (empresa pagou coisa PF ou vice-versa) conta como preenchido', () => {
    expect(validarParaConfirmar({ ...ok, pf_pj: 'FRONTEIRA' })).toEqual({ ok: true, faltando: [] });
  });
  it('lançamento completo passa', () => {
    expect(validarParaConfirmar(ok)).toEqual({ ok: true, faltando: [] });
  });
  it('sem valor não passa', () => {
    expect(validarParaConfirmar({ ...ok, valor: null }).faltando).toContain('valor');
  });
  it('valor zero/negativo não passa', () => {
    expect(validarParaConfirmar({ ...ok, valor: 0 }).ok).toBe(false);
    expect(validarParaConfirmar({ ...ok, valor: -5 }).ok).toBe(false);
  });
  it('sem pf_pj não passa (Eva pergunta com botões)', () => {
    expect(validarParaConfirmar({ ...ok, pf_pj: null }).faltando).toContain('pf_pj');
  });
  it('data inválida não passa', () => {
    expect(validarParaConfirmar({ ...ok, data_evento: '11/06/2026' }).faltando).toContain('data');
    expect(validarParaConfirmar({ ...ok, data_evento: null }).faltando).toContain('data');
  });
});

describe('financeiro/lancamentos: duplicado', () => {
  const novo = { valor: 380, contraparte: 'Posto Shell', data_evento: '2026-06-11' };
  it('mesmo valor + contraparte (normalizada) + dia = duplicado', () => {
    expect(ehDuplicado(novo, [{ valor: 380, contraparte: 'posto shell ', data_evento: '2026-06-11' }])).toBe(true);
  });
  it('valor diferente não é duplicado', () => {
    expect(ehDuplicado(novo, [{ valor: 100, contraparte: 'Posto Shell', data_evento: '2026-06-11' }])).toBe(false);
  });
  it('sem contraparte nunca acusa duplicado (2 almoços sem nome são legítimos)', () => {
    expect(ehDuplicado({ ...novo, contraparte: null }, [{ valor: 380, contraparte: null, data_evento: '2026-06-11' }])).toBe(false);
  });
  it('normaliza acento e caixa', () => {
    expect(normalizarContraparte('  Pádaria São João ')).toBe('padaria sao joao');
  });
});

describe('financeiro/lancamentos: expiração e competência', () => {
  it('pendente com mais de 24h expira', () => {
    expect(pendenteExpirado('2026-06-10T10:00:00Z', new Date('2026-06-11T10:00:01Z'))).toBe(true);
    expect(pendenteExpirado('2026-06-11T09:00:00Z', new Date('2026-06-11T10:00:00Z'))).toBe(false);
  });
  it('competência sai da data do evento', () => {
    expect(competenciaDe('2026-06-11')).toBe('2026-06');
  });
});
