// src/modules/marketing/ctwa-attribution.ts
import { resolveChannel, type Channel } from '../dashboard/resolve-channel.js';

const GRAPH = 'https://graph.facebook.com/v22.0';

export interface CtwaPatch {
  ad_id: string;
  ad_campaign_id: string | null;
  lead_source: string;
  channel: Channel;
}

/**
 * Monta o patch de atribuição pra um lead vindo de CTWA (Click-to-WhatsApp Ad).
 * Puro — channel computado via resolveChannel. lead_source='ad_ctwa' garante
 * classificação 'meta' mesmo se o campaign_id não resolver.
 */
export function buildCtwaPatch(adId: string, adCampaignId: string | null): CtwaPatch {
  const lead_source = 'ad_ctwa';
  const channel = resolveChannel({ adCampaignId, leadSource: lead_source });
  return { ad_id: adId, ad_campaign_id: adCampaignId, lead_source, channel };
}

/**
 * Decide se deve gravar atribuição CTWA: só lead novo OU sem atribuição prévia
 * e que ainda não avançou no funil (espelha o guard isHot do fluxo Lead Form).
 */
export function shouldAttributeCtwa(
  existing: { status?: string | null; ad_campaign_id?: string | null; lead_source?: string | null } | null,
): boolean {
  if (!existing) return true;
  if (existing.status && existing.status !== 'novo') return false;
  if (existing.ad_campaign_id || existing.lead_source) return false;
  return true;
}

/**
 * Resolve o campaign_id de um ad_id via Meta Graph API. Best-effort:
 * retorna null em qualquer falha (não bloqueia o fluxo de mensagem).
 */
export async function resolveCampaignIdFromAd(adId: string, accessToken: string): Promise<string | null> {
  try {
    const url = `${GRAPH}/${adId}?fields=campaign_id&access_token=${accessToken}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = (await r.json()) as { campaign_id?: string };
    return json.campaign_id ?? null;
  } catch {
    return null;
  }
}
