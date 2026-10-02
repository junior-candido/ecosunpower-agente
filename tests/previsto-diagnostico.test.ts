// 02/10/2026 — Diagnóstico do Previsto × Real (hipóteses rotuladas).
import { describe, it, expect } from 'vitest';
import { diagnosticarDias, diagnosticarCurva } from '../src/modules/monitoring/previsto/diagnostico.js';

const dia = (k: number, r: number, clima = 'limpo') => {
  const data = new Date(Date.UTC(2026, 8, 1 + k)).toISOString().slice(0, 10);
  return { data, previsto: 50, real: r === null ? null : 50 * r, clima: clima as never };
};
const tipos = (hs: { tipo: string }[]) => hs.map((h) => h.tipo);

describe('diagnóstico dia a dia', () => {
  it('queda em degrau → string/módulo parado', () => {
    const ds = [...Array(8)].map((_, k) => dia(k, 0.95)).concat([...Array(6)].map((_, k) => dia(8 + k, 0.72)));
    const h = diagnosticarDias(ds);
    expect(tipos(h)).toEqual(['degrau']);
    expect(h[0].evidencia).toContain('72%');
    expect(h[0].confianca).toBe('provavel');
  });
  it('escorregando aos poucos e subindo depois da chuva → sujeira', () => {
    const ds = [...Array(14)].map((_, k) => dia(k, 0.97 - k * 0.006));
    ds.push(dia(14, 0.2, 'chuva'));
    ds.push(dia(15, 0.96), dia(16, 0.97), dia(17, 0.96));
    const h = diagnosticarDias(ds.slice(0, 14).concat(ds.slice(14)));
    expect(tipos(h)).toContain('sujeira');
  });
  it('sempre ~75% estável → rendimento baixo (cadastro/sombra)', () => {
    const h = diagnosticarDias([...Array(10)].map((_, k) => dia(k, 0.75 + (k % 2) * 0.01)));
    expect(tipos(h)).toEqual(['rendimento_baixo']);
  });
  it('usina sã → nenhuma hipótese', () => {
    expect(diagnosticarDias([...Array(12)].map((_, k) => dia(k, 0.95 + (k % 3) * 0.01)))).toEqual([]);
  });
  it('poucos dias → não arrisca', () => {
    expect(diagnosticarDias([dia(0, 0.5), dia(1, 0.5)])).toEqual([]);
  });
});

describe('diagnóstico hora a hora', () => {
  const sino = Array.from({ length: 24 }, (_, h) => (h >= 6 && h <= 18 ? Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) * 8 : 0));
  it('topo achatado → inversor cortando', () => {
    const real = sino.map((v) => Math.min(v, 6));
    const h = diagnosticarCurva(sino, real, 'limpo');
    expect(tipos(h)).toContain('corte_inversor');
  });
  it('despenca a zero ao meio-dia e volta → desligamento', () => {
    const real = [...sino]; real[12] = 0.2;
    expect(tipos(diagnosticarCurva(sino, real, 'limpo'))).toContain('desligamento');
  });
  it('curva sã ou dia de chuva → nada', () => {
    expect(diagnosticarCurva(sino, sino.map((v) => v * 0.9), 'limpo')).toEqual([]);
    const real = [...sino]; real[12] = 0;
    expect(diagnosticarCurva(sino, real, 'chuva')).toEqual([]);
  });
});

describe('tela: caixa de diagnóstico', async () => {
  const { renderPrevistoBody } = await import('../src/modules/dashboard/previsto-views.js');
  it('mostra hipótese com evidência e rótulo', () => {
    const previstos = [...Array(14)].map((_, k) => ({
      data: new Date(Date.UTC(2026, 8, 1 + k)).toISOString().slice(0, 10), kwh_previsto: 50, kwh_hora: Array(24).fill(0),
      irradiacao_kwh_m2: 6, indice_ceu: 0.9, clima: 'limpo' as const, premissas: {},
    }));
    const reais: Record<string, number> = {};
    previstos.forEach((p, k) => { reais[p.data] = k < 8 ? 47.5 : 36; });
    const h = renderPrevistoBody({ sistemaId: 's', nome: 'X', kwp: 10, local: 'DF', previstos, reais });
    expect(h).toContain('Diagnóstico — prováveis causas');
    expect(h).toContain('Queda em degrau');
    expect(h).toContain('PROVÁVEL');
    // Marco 5: a hipótese vira OS do tipo certo, já com o motivo escrito.
    expect(h).toContain('action="/dashboard/os/nova"');
    expect(h).toContain('name="sistemaId" value="s"');
    expect(h).toContain('name="tipo" value="revisao_inversor"');
    expect(h).toMatch(/name="motivo" value="Previsto × Real — Queda em degrau[^"]*Evidência:/);
    expect(h).toContain('Abrir OS de revisão do inversor/strings');
  });
});
