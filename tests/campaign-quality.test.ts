// tests/campaign-quality.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeCampaignQuality } from '../src/modules/marketing/campaign-quality.js';

const spends = [
  { campaignId: 'A', name: 'Form GO', spendBrl: 280 },
  { campaignId: 'B', name: 'Form DF', spendBrl: 480 },
];
const leads = [
  { campaignId: 'A', qualified: 10, totalLeads: 20 },
  { campaignId: 'B', qualified: 5, totalLeads: 18 },
];

describe('analyzeCampaignQuality', () => {
  it('calcula custo por lead qualificado e rankeia campeã x cara', () => {
    const r = analyzeCampaignQuality(spends, leads, { minLeadsParaJulgar: 5, desvioPct: 0.4 });
    const a = r.rows.find((x) => x.campaignId === 'A')!;
    const b = r.rows.find((x) => x.campaignId === 'B')!;
    expect(a.costPerQualified).toBe(28);
    expect(b.costPerQualified).toBe(96);
    expect(a.status).toBe('campea');
    expect(b.status).toBe('cara');
    expect(r.mediaCostPerQualified).toBeCloseTo(50.67, 1);
  });

  it('empate (mesmo custo) → ambas ok', () => {
    const r = analyzeCampaignQuality(
      [{ campaignId: 'A', name: 'A', spendBrl: 100 }, { campaignId: 'B', name: 'B', spendBrl: 100 }],
      [{ campaignId: 'A', qualified: 5, totalLeads: 10 }, { campaignId: 'B', qualified: 5, totalLeads: 10 }],
    );
    expect(r.rows.every((x) => x.status === 'ok')).toBe(true);
  });

  it('volume baixo (< min) → sem_dados, sem recomendação de corte', () => {
    const r = analyzeCampaignQuality(
      [{ campaignId: 'A', name: 'A', spendBrl: 50 }],
      [{ campaignId: 'A', qualified: 0, totalLeads: 2 }],
      { minLeadsParaJulgar: 5 },
    );
    expect(r.rows[0].status).toBe('sem_dados');
  });

  it('gastou e 0 qualificados (com volume) → cara, custo null', () => {
    const r = analyzeCampaignQuality(
      [{ campaignId: 'A', name: 'A', spendBrl: 300 }, { campaignId: 'B', name: 'B', spendBrl: 100 }],
      [{ campaignId: 'A', qualified: 0, totalLeads: 12 }, { campaignId: 'B', qualified: 5, totalLeads: 10 }],
      { minLeadsParaJulgar: 5 },
    );
    const a = r.rows.find((x) => x.campaignId === 'A')!;
    expect(a.costPerQualified).toBeNull();
    expect(a.status).toBe('cara');
  });

  it('média ignora campanhas sem_dados', () => {
    const r = analyzeCampaignQuality(
      [{ campaignId: 'A', name: 'A', spendBrl: 100 }, { campaignId: 'B', name: 'B', spendBrl: 999 }],
      [{ campaignId: 'A', qualified: 5, totalLeads: 10 }, { campaignId: 'B', qualified: 0, totalLeads: 1 }],
      { minLeadsParaJulgar: 5 },
    );
    expect(r.mediaCostPerQualified).toBe(20);
  });

  it('campanha sem nenhum gasto registrado não quebra', () => {
    const r = analyzeCampaignQuality(
      [],
      [{ campaignId: 'A', qualified: 3, totalLeads: 8 }],
    );
    expect(r.rows[0].spendBrl).toBe(0);
    expect(r.rows[0].costPerQualified).toBeNull();
    expect(r.rows[0].status).toBe('sem_dados');
  });

  it('ordena por custo por qualificado ascendente (mais barata primeiro)', () => {
    const r = analyzeCampaignQuality(spends, leads, { minLeadsParaJulgar: 5, desvioPct: 0.4 });
    expect(r.rows[0].campaignId).toBe('A'); // A=28, B=96 → A vem primeiro
  });
});
