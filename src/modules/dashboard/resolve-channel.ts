export type Channel = 'meta' | 'google' | 'blog' | 'direto' | 'indicacao' | 'outro';

export interface ChannelInput {
  adCampaignId?: string | null;
  leadSource?: string | null;
  origin?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
}

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

// Mapeia um token textual -> canal conhecido, ou '' se não reconhecer.
function tokenToChannel(s: string): Channel | '' {
  if (!s) return '';
  if (/(^|[^a-z])(meta|facebook|instagram|fb|ig)([^a-z]|$)/.test(s)) return 'meta';
  if (/(^|[^a-z])(google|gads|adwords|google[_-]?ads)([^a-z]|$)/.test(s)) return 'google';
  if (/(^|[^a-z])(indica[cç][aã]o|indicacao|referral|indica)([^a-z]|$)/.test(s)) return 'indicacao';
  if (/(^|[^a-z])(blog|org[aâ]nico|organico|seo)([^a-z]|$)/.test(s)) return 'blog';
  return '';
}

export function resolveChannel(input: ChannelInput | null | undefined): Channel {
  const i = input ?? {};
  // 1) anúncio Meta (CTWA/ad) tem prioridade máxima
  if (norm(i.adCampaignId)) return 'meta';
  // 2-4) lead_source -> origin -> utm_source -> utm_campaign
  for (const raw of [i.leadSource, i.origin, i.utmSource, i.utmCampaign]) {
    const s = norm(raw);
    if (!s) continue;
    const c = tokenToChannel(s);
    if (c) return c;
  }
  // 5) referrer
  const ref = norm(i.referrer);
  if (ref) {
    if (ref.includes('google.')) return 'google';
    if (ref.includes('ecosunpower.eng.br/blog') || ref.includes('/blog')) return 'blog';
  }
  // 6) houve sinal não reconhecido -> 'outro'; nada -> 'direto'
  const hadSignal = [i.leadSource, i.origin, i.utmSource, i.utmCampaign, i.referrer].some(v => norm(v));
  return hadSignal ? 'outro' : 'direto';
}
