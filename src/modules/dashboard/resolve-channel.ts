export type Channel = 'meta' | 'google' | 'blog' | 'direto' | 'indicacao' | 'base_propria' | 'outro';

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
// IMPORTANTE: ordem das regexs codifica prioridade. Primeiro casa vence.
// Orgânico ANTES de meta: 'organico_ig'/'organico_fb' não pode cair em paid
// meta (a regex meta casa 'ig'/'fb'). 'blog' é o bucket orgânico/SEO.
function tokenToChannel(s: string): Channel | '' {
  if (!s) return '';
  // Orgânico ANTES de meta: 'organico_ig'/'organico_fb' não pode cair em paid
  // meta (a regex meta casa 'ig'/'fb'). 'blog' é o bucket orgânico/SEO.
  if (/(^|[^a-z])(blog|org[aâ]nico|organico|seo)([^a-z]|$)/.test(s)) return 'blog';
  // Paid Meta: inclui 'ctwa'/'ad_ctwa' (Click-to-WhatsApp Ad).
  if (/(^|[^a-z])(meta|facebook|instagram|fb|ig|ctwa)([^a-z]|$)/.test(s)) return 'meta';
  if (/(^|[^a-z])(google|gads|adwords|google[_-]?ads)([^a-z]|$)/.test(s)) return 'google';
  // Base propria: leads de bases terceirizadas que sao reativadas + reengagement manual + neemias (base velha do Junior)
  if (/(^|[^a-z])(terceirizada|terceirizado|reengagement|reativacao|reativado|recovered|recuperado|neemias|base[_-]?propria)([^a-z]|$)/.test(s)) return 'base_propria';
  // Venda direta presencial entra como indicacao (origem nao-digital, contato proximo)
  if (/(^|[^a-z])(indica[cç][aã]o|indicacao|referral|indica|venda[_-]?direta|presencial|amigo|familiar)([^a-z]|$)/.test(s)) return 'indicacao';
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
