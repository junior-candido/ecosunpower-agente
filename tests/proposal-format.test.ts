import { describe, it, expect } from 'vitest';
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
});
