// 02/10/2026 — Relatório "a culpa foi da rede" (PDF).
import { describe, it, expect } from 'vitest';
import { montarRelatorioRede, diaBrasilia } from '../src/modules/monitoring/rede/relatorio.js';
import { renderRelatorioRedeHtml } from '../src/modules/dashboard/rede-relatorio-html.js';

const ts = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 8, d, h + 3, m)).toISOString();
function dia(d: number, picoV: number, desarme = false) {
  const L = [], G = [];
  for (let k = 0; k < 96; k++) {
    const h = k / 4, sol = h > 7 && h < 16 ? Math.sin(((h - 7) / 9) * Math.PI) : 0;
    L.push({ ts: ts(d, Math.floor(h), (k % 4) * 15), fase: 'tensao_fase_a', v: 222 + sol * (picoV - 222) });
    let kw = h > 6 && h < 18 ? Math.sin(((h - 6) / 12) * Math.PI) * 8 : 0;
    if (desarme && h > 11.5 && h <= 11.75) kw = 0.05;
    G.push({ ts: ts(d, Math.floor(h), (k % 4) * 15), kw });
  }
  return { L, G };
}
const DIAS = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'];

describe('relatório da rede', () => {
  const a = dia(20, 228), b = dia(21, 245, true), c = dia(22, 236);
  const r = montarRelatorioRede([...a.L, ...b.L, ...c.L], [...a.G, ...b.G, ...c.G], DIAS);
  it('resume dias, desarmes, máxima e pior dia', () => {
    expect(r.dias.map((d) => d.dia)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22']);
    expect(r.diasSemLeitura).toEqual(['2026-09-23']);
    expect(r.desarmes).toBeGreaterThanOrEqual(1);
    expect(r.piorDia).toBe('2026-09-21');
    expect(r.maxima?.dia).toBe('2026-09-21');
    expect(r.conclusao).toContain('REDE');
  });
  it('dia de Brasília (23h BRT ainda é o mesmo dia)', () => {
    expect(diaBrasilia('2026-09-22T02:30:00Z')).toBe('2026-09-21');
  });
  it('HTML do PDF: marca do dono, conclusão, tabela e base técnica', () => {
    const html = renderRelatorioRedeHtml({
      marca: { nomeFantasia: 'Empresa <X>', logoSrc: null, cor: '#0f766e', telefone: null, email: 'a@b.c', site: '', rodapeRt: 'RT Fulano — Responsável Técnico CREA/CFT' },
      usina: { nome: 'Usina Teste', local: 'Planaltina · GO', kwp: 106.4 }, periodo: { de: '2026-09-20', ate: '2026-09-23' },
      fonte: 'inversor sungrow', resumo: r, piorDia: { leituras: b.L, geracao: b.G }, emitidoEm: '2026-10-02T10:00:00Z',
    });
    expect(html).toContain('Relatório de qualidade da tensão da rede');
    expect(html).toContain('Empresa &lt;X&gt;');
    expect(html).toContain('PRODIST, Módulo 8');
    expect(html).toContain('Dia mais crítico: 21/09/2026');
    expect(html).toContain('Responsável Técnico CREA/CFT');
    expect(html).not.toContain('EcoSun');
  });
});
