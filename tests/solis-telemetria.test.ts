// 02/10/2026 — Solis: tensão da rede (aba Rede) a partir do inverterDetail.
import { describe, it, expect } from 'vitest';
import { parseSolisDetalhe, inversoresDaLista } from '../src/modules/monitoring/adapters/solis.js';

const cat = new Map([
  ['pac', { ponto: 'potencia', unidade: 'kW', fator: 1 }],
  ['uAc1', { ponto: 'tensao_fase_a', unidade: 'V', fator: 1 }],
  ['uAc2', { ponto: 'tensao_fase_b', unidade: 'V', fator: 1 }],
  ['uAc3', { ponto: 'tensao_fase_c', unidade: 'V', fator: 1 }],
  ['fac', { ponto: 'frequencia', unidade: 'Hz', fator: 1 }],
]);
const TS = '2026-10-02T15:00:00Z';

describe('Solis inverterDetail → telemetria', () => {
  it('monofásico: só fase A; uAc2/uAc3 = 0 descartados; pac em kW', () => {
    const l = parseSolisDetalhe({ pac: 3.42, pacStr: 'kW', uAc1: 228.4, uAc2: 0, uAc3: 0, fac: 60.01 }, cat, TS);
    expect(l).toEqual(expect.arrayContaining([
      { ponto: 'potencia', valor: 3.42, unidade: 'kW', ts: TS },
      { ponto: 'tensao_fase_a', valor: 228.4, unidade: 'V', ts: TS },
      { ponto: 'frequencia', valor: 60.01, unidade: 'Hz', ts: TS },
    ]));
    expect(l.find((x) => x.ponto === 'tensao_fase_b')).toBeUndefined();
  });
  it('trifásico + pac em W vira kW', () => {
    const l = parseSolisDetalhe({ pac: 8250, pacStr: 'W', uAc1: 221, uAc2: 224, uAc3: 219 }, cat, TS);
    expect(l.find((x) => x.ponto === 'potencia')?.valor).toBe(8.25);
    expect(l.filter((x) => x.ponto.startsWith('tensao_fase')).length).toBe(3);
  });
  it('campo ausente/nulo/texto não vira leitura', () => {
    expect(parseSolisDetalhe({ uAc1: null, fac: '', pac: 'x' }, cat, TS)).toEqual([]);
  });
  it('inverterList: aceita data.page.records', () => {
    expect(inversoresDaLista({ page: { records: [{ id: '1', sn: 'A' }, { id: '', sn: '' }] } })).toEqual([{ id: '1', sn: 'A' }]);
    expect(inversoresDaLista(null)).toEqual([]);
  });
});
