import { describe, it, expect } from 'vitest';
import { buildCampaignDigest } from '../src/modules/marketing/campaign-recommender.js';
import type { CampaignQualityReport } from '../src/modules/marketing/campaign-quality.js';

const report: CampaignQualityReport = {
  mediaCostPerQualified: 50.67,
  rows: [
    { campaignId: 'A', name: 'Form GO', spendBrl: 280, qualified: 10, totalLeads: 20, costPerQualified: 28, status: 'campea' },
    { campaignId: 'B', name: 'Form DF', spendBrl: 480, qualified: 5, totalLeads: 18, costPerQualified: 96, status: 'cara' },
  ],
};

describe('buildCampaignDigest', () => {
  it('cita a campeã e a pior, com os custos', () => {
    const txt = buildCampaignDigest(report, 14);
    expect(txt).toContain('Form GO');
    expect(txt).toContain('R$28');
    expect(txt).toContain('Form DF');
    expect(txt).toContain('R$96');
    expect(txt).toContain('escalar');
    expect(txt).toContain('cortar');
  });

  it('quando não há dados suficientes em nenhuma, avisa que está juntando dados', () => {
    const semDados: CampaignQualityReport = {
      mediaCostPerQualified: null,
      rows: [{ campaignId: 'A', name: 'A', spendBrl: 50, qualified: 0, totalLeads: 2, costPerQualified: null, status: 'sem_dados' }],
    };
    const txt = buildCampaignDigest(semDados, 14);
    expect(txt.toLowerCase()).toContain('juntando dados');
  });
});
