// tests/channel-mapper.test.ts
//
// TDD para leadRowToChannelInput.
// Campos REAIS da tabela leads (migration 008):
//   ad_campaign_id, lead_source, origin, utm_source, utm_campaign
// (sem referrer — coluna nao existe na tabela leads)

import { describe, it, expect } from 'vitest';
import { leadRowToChannelInput } from '../src/modules/dashboard/channel-mapper.js';

describe('leadRowToChannelInput', () => {
  it('mapeia todos os campos de atribuicao do lead row -> ChannelInput', () => {
    const row = {
      ad_campaign_id: '120abc',
      lead_source: 'ad_ig_cta_wa',
      origin: 'organico_ig',
      utm_source: 'ig',
      utm_campaign: 'ig-a3f5c1',
    };
    expect(leadRowToChannelInput(row)).toEqual({
      adCampaignId: '120abc',
      leadSource: 'ad_ig_cta_wa',
      origin: 'organico_ig',
      utmSource: 'ig',
      utmCampaign: 'ig-a3f5c1',
      referrer: undefined,
    });
  });

  it('campos ausentes viram undefined, nao quebra', () => {
    expect(() => leadRowToChannelInput({})).not.toThrow();
    expect(leadRowToChannelInput({}).adCampaignId).toBeUndefined();
    expect(leadRowToChannelInput({}).leadSource).toBeUndefined();
    expect(leadRowToChannelInput({}).utmSource).toBeUndefined();
  });

  it('aceita row com campos null (nullable DB columns)', () => {
    const row = {
      ad_campaign_id: null,
      lead_source: null,
      origin: null,
      utm_source: null,
      utm_campaign: null,
    };
    const result = leadRowToChannelInput(row);
    expect(result.adCampaignId).toBeNull();
    expect(result.leadSource).toBeNull();
    expect(result.utmSource).toBeNull();
  });

  it('ignora campos extras no row (nao lanca erro)', () => {
    const row = {
      id: 'uuid-xyz',
      phone: '5561999999999',
      name: 'Joao',
      ad_campaign_id: '999',
      lead_source: 'organico_fb',
      origin: 'organico_fb',
      utm_source: 'fb',
      utm_campaign: 'fb-a1b2c3',
      status: 'qualificado',
    };
    const result = leadRowToChannelInput(row);
    expect(result.adCampaignId).toBe('999');
    expect(result.leadSource).toBe('organico_fb');
    expect(result.origin).toBe('organico_fb');
  });
});
