// 02/10/2026 — Aba Rede: tensão × faixas ANEEL × desarmes prováveis.
import { describe, it, expect } from 'vitest';
import { analisarRede } from '../src/modules/monitoring/rede/analise.js';
import { renderRedeBody } from '../src/modules/dashboard/rede-views.js';
import { nominalPelaMediana } from '../src/modules/energia/prodist.js';

// 15 em 15 min, horário de Brasília (UTC-3)
const ts = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 30, h + 3, m)).toISOString();
const serie = (fn: (h: number) => number, fase = 'tensao_fase_a') => {
  const out = [];
  for (let k = 0; k < 96; k++) out.push({ ts: ts(Math.floor(k / 4), (k % 4) * 15), fase, v: fn(k / 4) });
  return out;
};
const gerSino = () => Array.from({ length: 96 }, (_, k) => {
  const h = k / 4;
  return { ts: ts(Math.floor(h), (k % 4) * 15), kw: h > 6 && h < 18 ? Math.sin(((h - 6) / 12) * Math.PI) * 8 : 0 };
});

describe('análise da rede', () => {
  it('rede boa o dia todo → ok, 220 V inferido', () => {
    const a = analisarRede(serie(() => 221));
    expect(a.nivel).toBe('ok');
    expect(a.nominal).toBe(220);
    expect(a.fases[0].minutos.adequada).toBeGreaterThan(1400);
  });
  it('subindo ao meio-dia acima de 242 V → crítico com minutos acima do desarme', () => {
    const a = analisarRede(serie((h) => (h >= 11 && h < 13 ? 244 : 225)));
    expect(a.nivel).toBe('critico');
    expect(a.fases[0].minutosAcimaDesarme).toBe(120);
    expect(a.veredito).toContain('fora da faixa');
  });
  it('tensão alta e a geração despenca logo depois → desarme provável (culpa da rede)', () => {
    const v = serie((h) => (h === 12 ? 245 : 226));
    const g = gerSino().map((p) => (Date.parse(p.ts) > Date.parse(ts(12)) && Date.parse(p.ts) <= Date.parse(ts(12, 15)) ? { ...p, kw: 0.1 } : p));
    const a = analisarRede(v, g);
    expect(a.desarmes).toHaveLength(1);
    expect(a.veredito).toContain('pela REDE');
  });
  it('nuvem (geração cai) sem tensão alta → não é desarme', () => {
    const g = gerSino().map((p, k) => (k === 49 ? { ...p, kw: 0.2 } : p));
    expect(analisarRede(serie(() => 225), g).desarmes).toHaveLength(0);
  });
  it('sem leitura → sem_dado', () => {
    expect(analisarRede([]).nivel).toBe('sem_dado');
  });
  it('nominal pela mediana: 127 / 220', () => {
    expect(nominalPelaMediana([126, 128, 130])).toBe(127);
    expect(nominalPelaMediana([219, 224, 229])).toBe(220);
  });
});

describe('tela Rede', () => {
  it('mostra veredito, tabela por fase e desarmes', () => {
    const v = serie((h) => (h === 12 ? 245 : 226));
    const g = gerSino().map((p) => (Date.parse(p.ts) > Date.parse(ts(12)) && Date.parse(p.ts) <= Date.parse(ts(12, 15)) ? { ...p, kw: 0.1 } : p));
    const h = renderRedeBody({ sistemaId: 's', nome: 'Usina <X>', local: 'DF', dia: '2026-09-30', leituras: v, geracao: g, analise: analisarRede(v, g), fonte: 'inversor sungrow', marcaTemTensao: true });
    expect(h).toContain('🔴 Rede fora da faixa');
    expect(h).toContain('Fase A');
    expect(h).toContain('12:00');
    expect(h).toContain('Usina &lt;X&gt;');
  });
  it('marca sem tensão: explica', () => {
    const h = renderRedeBody({ sistemaId: 's', nome: 'X', local: 'DF', dia: '2026-09-30', leituras: [], geracao: [], analise: analisarRede([]), fonte: 'inversor goodwe', marcaTemTensao: false });
    expect(h).toContain('ainda não manda a tensão');
  });
});
