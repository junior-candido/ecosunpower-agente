import { describe, it, expect, vi } from 'vitest';
import { fmtRs, fmtNum, fmtPct, fmtCurto, escapeHtml } from '../src/modules/proposal/format.js';

describe('proposal/format', () => {
  it('fmtRs formata com 2 casas em pt-BR', () => {
    expect(fmtRs(38500)).toBe('38.500,00');
    expect(fmtRs(38500, 0)).toBe('38.500');
  });
  it('fmtCurto encurta milhares e milhões', () => {
    expect(fmtCurto(38500)).toBe('R$ 38,5k');
    expect(fmtCurto(1_200_000)).toBe('R$ 1,2M');
    expect(fmtCurto(850)).toBe('R$ 850');
  });
  it('fmtPct adiciona % com 1 casa default', () => {
    expect(fmtPct(23.456)).toBe('23,5%');
  });
  it('escapeHtml neutraliza caracteres perigosos', () => {
    expect(escapeHtml('<b>"x"&\'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
  });
  it('fmtNum formata inteiro sem casas e respeita frac', () => {
    expect(fmtNum(1234)).toBe('1.234');
    expect(fmtNum(1234.5, 1)).toBe('1.234,5');
  });
  it('fmtCurto respeita as fronteiras 1.000 e 1.000.000', () => {
    expect(fmtCurto(999)).toBe('R$ 999');
    expect(fmtCurto(1000)).toBe('R$ 1k');
    expect(fmtCurto(1_000_000)).toBe('R$ 1M');
  });

  // Incidente 24/06: um campo null chegou num fmt e derrubou a proposta INTEIRA
  // ("Cannot read properties of null (reading 'toLocaleString')"). A proposta é
  // caminho crítico — o formatador degrada pra 0 (+ warn) em vez de explodir.
  it('null/undefined/NaN viram 0 em vez de lançar (proposta não pode falhar)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => fmtRs(null as any)).not.toThrow();
    expect(fmtRs(null as any, 0)).toBe('0');
    expect(fmtNum(undefined as any)).toBe('0');
    expect(fmtPct(NaN as any, 0)).toBe('0%');
    expect(fmtCurto(null as any)).toBe('R$ 0');
    warn.mockRestore();
  });
  it('loga aviso pra rastrear a origem do valor faltando', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fmtRs(null as any);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
