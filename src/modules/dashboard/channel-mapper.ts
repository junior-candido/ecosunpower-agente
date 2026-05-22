// channel-mapper.ts
//
// Mapper PURO (zero side-effects) de lead DB row -> ChannelInput.
//
// Campos de atribuição reais na tabela `leads` (migration 008):
//   ad_campaign_id  — ID da campanha Meta (Lead Ads ou CTWA)
//   lead_source     — tipo do canal textual (ex: 'ad_ig_cta_wa', 'organico_fb')
//   origin          — alias histórico de lead_source (gravado no tracking tag)
//   utm_source      — utm parameter (gravado junto com lead_source no tracking)
//   utm_campaign    — campanha utm (ex: 'ig-a3f5c1')
//
// Coluna `referrer` NÃO existe na tabela leads — sempre undefined.

import type { ChannelInput } from './resolve-channel.js';

// Subtipo do row real da tabela leads — só os campos de atribuição.
// Usa Record<string, unknown> como base para aceitar o `select('*')` do
// Supabase sem precisar de cast no chamador.
// Extrai um campo do row: retorna o valor (incluindo null) se a chave existe,
// ou undefined se a chave não está presente no objeto.
function pick(row: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in row)) return undefined;
  const v = row[key];
  if (v === null) return null;
  if (typeof v === 'string') return v;
  return undefined;
}

export function leadRowToChannelInput(row: Record<string, unknown>): ChannelInput {
  return {
    adCampaignId: pick(row, 'ad_campaign_id'),
    leadSource:   pick(row, 'lead_source'),
    origin:       pick(row, 'origin'),
    utmSource:    pick(row, 'utm_source'),
    utmCampaign:  pick(row, 'utm_campaign'),
    referrer:     undefined, // coluna inexistente na tabela leads
  };
}
