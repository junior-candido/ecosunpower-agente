// tests/clientes-insights.test.ts
import { describe, it, expect } from 'vitest';
import { getEvaInsights } from '../src/modules/clientes/insights.js';

const hoje = new Date('2026-05-20T12:00:00Z');

function base(o: any = {}): any {
  return {
    installed_at: '2025-09-01',
    review_confirmed_at: null,
    sistema: { id: 'sid-1', ratio_ultimos_7d: 1.0 },
    consumo_mensal_json: null,
    opt_out: false,
    manutencoes_futuras: [],
    ...o,
  };
}

describe('getEvaInsights — Upgrade (conta subiu)', () => {
  it('dispara se +25% em 3 meses', () => {
    const detail = base({
      consumo_mensal_json: {
        '2026-02': 1000,
        '2026-03': 1200,
        '2026-04': 1350,
      },
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'upgrade')).toBeDefined();
  });
  it('não dispara se variação < 25%', () => {
    const detail = base({
      consumo_mensal_json: {
        '2026-02': 1000,
        '2026-03': 1050,
        '2026-04': 1100,
      },
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'upgrade')).toBeUndefined();
  });
  it('não dispara se consumo_mensal_json vazio', () => {
    const r = getEvaInsights(base(), hoje);
    expect(r.find((c) => c.id === 'upgrade')).toBeUndefined();
  });
});

describe('getEvaInsights — Depoimento', () => {
  it('dispara se ratio_7d > 1.1 E installed > 60d E sem review_confirmed_at', () => {
    const detail = base({
      sistema: { id: 'sid-1', ratio_ultimos_7d: 1.15 },
      installed_at: '2025-09-01',
      review_confirmed_at: null,
    });
    const r = getEvaInsights(detail, hoje);
    const dep = r.find((c) => c.id === 'depoimento');
    expect(dep).toBeDefined();
    expect(dep?.cta?.action).toBe('eva_pedir_depoimento');
  });
  it('não dispara se já tem review_confirmed_at', () => {
    const detail = base({
      sistema: { id: 'sid-1', ratio_ultimos_7d: 1.15 },
      review_confirmed_at: '2026-04-01',
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'depoimento')).toBeUndefined();
  });
  it('não dispara se installed < 60d', () => {
    const detail = base({
      sistema: { id: 'sid-1', ratio_ultimos_7d: 1.15 },
      installed_at: '2026-05-01',
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'depoimento')).toBeUndefined();
  });
});

describe('getEvaInsights — Aniversário', () => {
  it('dispara se mês atual = mês installed E ano > ano installed', () => {
    const detail = base({ installed_at: '2025-05-15' });
    const r = getEvaInsights(detail, hoje);
    const aniv = r.find((c) => c.id === 'aniversario');
    expect(aniv).toBeDefined();
    expect(aniv?.cta?.action).toBe('agendar_revisao_aniversario');
  });
  it('não dispara no mesmo ano da instalação', () => {
    const detail = base({ installed_at: '2026-05-01' });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'aniversario')).toBeUndefined();
  });
  it('não dispara se já tem lembrete aniversario_Na nos últimos 30d', () => {
    const detail = base({
      installed_at: '2025-05-15',
      manutencoes_futuras: [
        { scheduled_date: '2026-05-15', topic: 'aniversario_1a' },
      ],
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'aniversario')).toBeUndefined();
  });
});

describe('getEvaInsights — CTA desabilitada se opt_out', () => {
  it('depoimento sem cta quando opt_out=true', () => {
    const detail = base({
      sistema: { id: 'sid-1', ratio_ultimos_7d: 1.15 },
      opt_out: true,
    });
    const r = getEvaInsights(detail, hoje);
    const dep = r.find((c) => c.id === 'depoimento');
    expect(dep?.cta).toBeNull();
  });
});
