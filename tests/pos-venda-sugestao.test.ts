import { describe, it, expect } from 'vitest';
import { sugestaoProativa, type LinhaSugestao } from '../src/modules/dashboard/pos-venda-sugestao.js';

const HOJE = new Date('2026-07-01T00:00:00Z');
const base: LinhaSugestao = {
  saude: 'verde',
  ultimoContatoEm: '2026-06-25T00:00:00Z',
  elegivelUpgrade: false,
  dataInstalacao: '2025-01-01',
  gerouBem: false,
  ultimoContatoPositivoEm: null,
  snoozedTipos: new Set<string>(),
};

describe('sugestaoProativa — memoria', () => {
  it('NUNCA sugere depoimento (virou manual)', () => {
    const l = { ...base, dataInstalacao: '2024-01-01' };
    const s = sugestaoProativa(l, HOJE);
    expect(s?.tipo).not.toBe('depoimento');
  });

  it('geracao saudavel: verde + gerouBem + sem contato positivo → sugere boa noticia', () => {
    const l = { ...base, gerouBem: true, ultimoContatoPositivoEm: null };
    expect(sugestaoProativa(l, HOJE)?.tipo).toBe('geracao_saudavel');
  });

  it('geracao saudavel NAO aparece se snoozed', () => {
    const l = { ...base, gerouBem: true, snoozedTipos: new Set(['geracao_saudavel']) };
    expect(sugestaoProativa(l, HOJE)).toBeNull();
  });

  it('geracao saudavel NAO aparece se teve contato positivo recente (<60d)', () => {
    const l = { ...base, gerouBem: true, ultimoContatoPositivoEm: '2026-06-20T00:00:00Z' };
    expect(sugestaoProativa(l, HOJE)).toBeNull();
  });

  it('vermelho sugere queda; some se snoozed', () => {
    expect(sugestaoProativa({ ...base, saude: 'vermelho' }, HOJE)?.tipo).toBe('queda');
    expect(sugestaoProativa({ ...base, saude: 'vermelho', snoozedTipos: new Set(['queda']) }, HOJE)).toBeNull();
  });

  it('sem falar ha >90d sugere contato; some se snoozed', () => {
    const l = { ...base, ultimoContatoEm: '2026-01-01T00:00:00Z' };
    expect(sugestaoProativa(l, HOJE)?.tipo).toBe('contato');
    expect(sugestaoProativa({ ...l, snoozedTipos: new Set(['contato']) }, HOJE)).toBeNull();
  });

  it('upgrade quando elegivel; some se snoozed', () => {
    const l = { ...base, elegivelUpgrade: true };
    expect(sugestaoProativa(l, HOJE)?.tipo).toBe('upgrade');
    expect(sugestaoProativa({ ...l, snoozedTipos: new Set(['upgrade']) }, HOJE)).toBeNull();
  });

  it('saude amarela (queda de geracao aberta) sugere queda', () => {
    const s = sugestaoProativa({
      saude: 'amarelo',
      ultimoContatoEm: null,
      elegivelUpgrade: false,
      dataInstalacao: null,
      gerouBem: false,
      ultimoContatoPositivoEm: null,
      snoozedTipos: new Set<string>(),
    }, new Date('2026-07-02T12:00:00Z'));
    expect(s?.tipo).toBe('queda');
  });

  it('saude amarela com queda snoozed NAO sugere queda', () => {
    const s = sugestaoProativa({
      saude: 'amarelo',
      ultimoContatoEm: null,
      elegivelUpgrade: false,
      dataInstalacao: null,
      gerouBem: false,
      ultimoContatoPositivoEm: null,
      snoozedTipos: new Set(['queda']),
    }, new Date('2026-07-02T12:00:00Z'));
    expect(s?.tipo).not.toBe('queda');
  });
});
