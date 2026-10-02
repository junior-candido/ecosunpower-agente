// 02/10/2026 — Multi-arranjo: usina com mais de uma água (ex.: Diego, leste + oeste).
import { describe, it, expect, vi } from 'vitest';
import { lerArranjos, montarPremissas } from '../src/modules/monitoring/previsto/premissas.js';
import { previstoDoDiaTotal } from '../src/modules/monitoring/previsto/motor-cliente.js';
import { renderPrevistoBody } from '../src/modules/dashboard/previsto-views.js';

const DIEGO = [
  { nome: 'Bloco A oeste', kwp: 2.86, azimute: 280, inclinacao: 10 },
  { nome: 'Bloco B leste', kwp: 2.86, azimute: 100, inclinacao: 4 },
];
const USINA = { id: 'd', company_id: 'c', potencia_kwp: 5.72, lat: -15.65, lng: -47.8, telhado_tipo: 'fibrocimento', telhado_orientacao: null, telhado_inclinacao_graus: null, sombreamento_pct: 0 };

describe('arranjos do cadastro', () => {
  it('lista válida; azimute normalizado; um arranjo ruim invalida tudo', () => {
    expect(lerArranjos([{ nome: 'x', kwp: 1, azimute: -80, inclinacao: 5 }])).toEqual([{ nome: 'x', kwp: 1, azimute: 280, inclinacao: 5 }]);
    expect(lerArranjos([...DIEGO, { kwp: 0, azimute: 0, inclinacao: 5 }])).toBeNull();
    expect(lerArranjos(null)).toBeNull();
    expect(lerArranjos([])).toBeNull();
  });
  it('premissas com arranjos: kWp somado, nada estimado', () => {
    const p = montarPremissas({ ...USINA, arranjos: DIEGO });
    expect(p).toMatchObject({ kwp: 5.72, estimados: [], arranjos: DIEGO });
  });
  it('sem arranjos: segue a orientação única (estimada)', () => {
    const p = montarPremissas(USINA);
    expect('arranjos' in p && p.arranjos).toBeFalsy();
  });
});

describe('previsto somado por água', () => {
  it('uma chamada por arranjo com a orientação de cada um; soma kWh e curva', async () => {
    const f = vi.fn().mockImplementation(async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      const kwh = b.azimute === 280 ? 20 : 18; // oeste rende um pouco mais à tarde
      return new Response(JSON.stringify({ data: b.data, kwh, kwh_hora: Array.from({ length: 24 }, (_, h) => (h === 12 ? kwh : 0)),
        ghi_kwh_m2: 6, poa_kwh_m2: b.azimute === 280 ? 6.1 : 5.9, indice_ceu: 0.8, clima: 'limpo', horas_sem_dado: 0, fonte_clima: 'x', versao_modelo: 'dia-1' }), { status: 200 });
    });
    const p = montarPremissas({ ...USINA, arranjos: DIEGO });
    if ('erro' in p) throw new Error('premissa');
    const r = await previstoDoDiaTotal({ url: 'http://m', fetchImpl: f }, p, '2026-10-01');
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls.map((c) => JSON.parse(c[1].body)).map((b) => [b.kwp, b.azimute, b.inclinacao])).toEqual([[2.86, 280, 10], [2.86, 100, 4]]);
    expect(r.kwh).toBe(38);
    expect(r.kwh_hora[12]).toBe(38);
    expect(r.poa_kwh_m2).toBeCloseTo(6.0, 2);
  });
});

describe('tela', () => {
  it('"por que" lista as águas', () => {
    const h = renderPrevistoBody({ sistemaId: 'd', nome: 'Diego', kwp: 5.72, local: 'Sobradinho', reais: {},
      previstos: [{ data: '2026-10-01', kwh_previsto: 38, kwh_hora: Array(24).fill(0), irradiacao_kwh_m2: 6, indice_ceu: 0.8, clima: 'limpo', premissas: { kwp: 5.72, arranjos: DIEGO } }] });
    expect(h).toContain('Telhado em <b>2 águas</b>');
    expect(h).toContain('Bloco A oeste');
    expect(h).toContain('Leste');
  });
});
