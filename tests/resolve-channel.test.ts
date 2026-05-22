import { describe, it, expect } from 'vitest';
import { resolveChannel } from '../src/modules/dashboard/resolve-channel.js';

describe('resolveChannel — prioridade determinística', () => {
  it('1) ad_campaign_id presente -> meta (CTWA/anúncio Meta)', () => {
    expect(resolveChannel({ adCampaignId: '120xyz' })).toBe('meta');
    expect(resolveChannel({ adCampaignId: '120xyz', leadSource: 'google' })).toBe('meta');
  });
  it('2) lead_source explícito', () => {
    expect(resolveChannel({ leadSource: 'google' })).toBe('google');
    expect(resolveChannel({ leadSource: 'gads' })).toBe('google');
    expect(resolveChannel({ leadSource: 'facebook' })).toBe('meta');
    expect(resolveChannel({ leadSource: 'instagram' })).toBe('meta');
    expect(resolveChannel({ leadSource: 'indicacao' })).toBe('indicacao');
    expect(resolveChannel({ leadSource: 'indicação' })).toBe('indicacao');
    expect(resolveChannel({ leadSource: 'blog' })).toBe('blog');
  });
  it('3) origin quando não há lead_source', () => {
    expect(resolveChannel({ origin: 'google' })).toBe('google');
    expect(resolveChannel({ origin: 'meta' })).toBe('meta');
  });
  it('4) utm_source/utm_campaign', () => {
    expect(resolveChannel({ utmSource: 'google' })).toBe('google');
    expect(resolveChannel({ utmSource: 'facebook' })).toBe('meta');
    expect(resolveChannel({ utmCampaign: 'blog-post-x' })).toBe('blog');
  });
  it('5) referrer', () => {
    expect(resolveChannel({ referrer: 'https://www.google.com/search' })).toBe('google');
    expect(resolveChannel({ referrer: 'https://ecosunpower.eng.br/blog/x' })).toBe('blog');
  });
  it('6) nada casa -> direto; presente mas irreconhecível -> outro; nunca lança', () => {
    expect(resolveChannel({})).toBe('direto');
    expect(resolveChannel(null as never)).toBe('direto');
    expect(resolveChannel(undefined as never)).toBe('direto');
    expect(resolveChannel({ leadSource: 'xyz-desconhecido' })).toBe('outro');
    expect(() => resolveChannel({ leadSource: 123 as never })).not.toThrow();
  });
});
