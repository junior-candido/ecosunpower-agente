// tests/ctwa-attribution.test.ts
import { describe, it, expect } from 'vitest';
import { buildCtwaPatch, shouldAttributeCtwa } from '../src/modules/marketing/ctwa-attribution.js';

describe('buildCtwaPatch', () => {
  it('com campaignId resolvido → channel meta e campos preenchidos', () => {
    const p = buildCtwaPatch('ad_123', 'camp_456');
    expect(p).toMatchObject({ ad_id: 'ad_123', ad_campaign_id: 'camp_456', lead_source: 'ad_ctwa', channel: 'meta' });
  });
  it('sem campaignId (null) → ainda channel meta (via lead_source ad_ctwa)', () => {
    const p = buildCtwaPatch('ad_123', null);
    expect(p.ad_campaign_id).toBeNull();
    expect(p.channel).toBe('meta');
  });
});

describe('shouldAttributeCtwa', () => {
  it('lead novo (null) → true', () => {
    expect(shouldAttributeCtwa(null)).toBe(true);
  });
  it('lead status novo sem atribuição → true', () => {
    expect(shouldAttributeCtwa({ status: 'novo' })).toBe(true);
  });
  it('lead que já avançou (status != novo) → false', () => {
    expect(shouldAttributeCtwa({ status: 'qualificado' })).toBe(false);
  });
  it('lead que já tem ad_campaign_id → false', () => {
    expect(shouldAttributeCtwa({ status: 'novo', ad_campaign_id: 'x' })).toBe(false);
  });
  it('lead que já tem lead_source → false', () => {
    expect(shouldAttributeCtwa({ status: 'novo', lead_source: 'organico_ig' })).toBe(false);
  });
});
