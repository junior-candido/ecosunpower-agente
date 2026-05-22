// tests/channel-funnel.test.ts
//
// Parte 1 — aggregateMetaDaily (helper puro, sem I/O)
// Parte 2 — aggregateChannelFunnel (helper puro, sem I/O) — T5

import { describe, it, expect } from 'vitest';
import { aggregateMetaDaily } from '../src/modules/marketing/insights-collector.js';
import { aggregateChannelFunnel } from '../src/modules/dashboard/marketing-queries.js';

describe('aggregateMetaDaily', () => {
  it('soma spend/clicks/impressions por dia', () => {
    const out = aggregateMetaDaily([
      { date_start: '2026-05-17', spend_cents: 1000, clicks: 10, impressions: 100 },
      { date_start: '2026-05-17', spend_cents: 500,  clicks: 5,  impressions: 50  },
    ]);
    expect(out).toEqual([{ date: '2026-05-17', spend_cents: 1500, clicks: 15, impressions: 150 }]);
  });

  it('retorna [] quando input eh vazio', () => {
    expect(aggregateMetaDaily([])).toEqual([]);
  });

  it('mantem dias distintos separados', () => {
    const out = aggregateMetaDaily([
      { date_start: '2026-05-16', spend_cents: 200, clicks: 2, impressions: 20 },
      { date_start: '2026-05-17', spend_cents: 800, clicks: 8, impressions: 80 },
    ]);
    expect(out).toHaveLength(2);
    const d16 = out.find((r) => r.date === '2026-05-16');
    const d17 = out.find((r) => r.date === '2026-05-17');
    expect(d16).toEqual({ date: '2026-05-16', spend_cents: 200, clicks: 2, impressions: 20 });
    expect(d17).toEqual({ date: '2026-05-17', spend_cents: 800, clicks: 8, impressions: 80 });
  });

  it('acumula corretamente 3+ campanhas no mesmo dia', () => {
    const out = aggregateMetaDaily([
      { date_start: '2026-05-18', spend_cents: 100, clicks: 1, impressions: 10 },
      { date_start: '2026-05-18', spend_cents: 200, clicks: 2, impressions: 20 },
      { date_start: '2026-05-18', spend_cents: 300, clicks: 3, impressions: 30 },
    ]);
    expect(out).toEqual([{ date: '2026-05-18', spend_cents: 600, clicks: 6, impressions: 60 }]);
  });
});

describe('aggregateChannelFunnel', () => {
  it('agrupa funil por channel + custo do channel_daily_metrics', () => {
    const leads = [
      { channel: 'meta', status: 'agendado' }, { channel: 'meta', status: 'qualificado' },
      { channel: 'google', status: 'novo' }, { channel: null, status: 'novo' },
    ];
    const metrics = [{ channel: 'meta', spend_cents: 30000 }];
    const out = aggregateChannelFunnel(leads, metrics);
    const meta = out.find(r => r.channel === 'meta')!;
    expect(meta.total).toBe(2); expect(meta.agendado).toBe(1); expect(meta.spend_cents).toBe(30000);
    expect(out.find(r => r.channel === 'google')!.spend_cents).toBe(0); // slot vazio
    expect(out.find(r => r.channel === 'direto')).toBeTruthy(); // channel null -> direto
  });
});
