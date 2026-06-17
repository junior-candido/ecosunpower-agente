// Mapping ad_id (Meta CTWA) -> template inicial de auto-ack.
//
// Quando lead vem clicando em anuncio Meta (Click-to-WhatsApp Ad), o payload
// WABA traz `referral.source_id` = ad_id. Aqui resolvemos pro template que
// vai disparar via /index.ts:auto-ack.
//
// Por que nao DB? O numero de anuncios ativos eh pequeno (2-4 por mes) e
// muda toda vez que Junior duplica/pausa campanha. Manter em codigo evita
// 1 query por msg recebida e expõe a estrategia A/B no diff de PR.
//
// Quando aprovar templates Meta + escalar, migrar pra coluna em
// marketing_campaigns (ja existe `template_inicial`) com sync periodico.
//
// HISTÓRICO:
// - 13/05/2026: Campanha CTWA_Solar_Mai_v1 publicada
//   - Ad Conjunto A (Interesse manual)   -> _eva_qualificacao_v1 (aprovado 17/06, com underline no nome)
//   - Ad Conjunto B (Advantage+ IA)      -> eva_curiosidade_v1
//   Templates ainda em revisao Meta — fallback eva_resposta_inicial
//   transparente no auto-ack quando template nao aprovado retorna erro.

const CTWA_AD_TO_TEMPLATE: Readonly<Record<string, string>> = Object.freeze({
  // CTWA_Solar_Mai_v1 (campaign 120249029179560385) — 13/05/2026
  '120249029179580385': '_eva_qualificacao_v1',  // Ad set A — Interesse manual
  '120249030622080385': 'eva_curiosidade_v1',   // Ad set B — Advantage+
});

/**
 * Resolve qual template usar pro auto-ack baseado no ad_id Meta.
 * Retorna null se ad_id desconhecido (caller usa default global).
 */
export function templateParaAdMeta(adId: string | null | undefined): string | null {
  if (!adId) return null;
  return CTWA_AD_TO_TEMPLATE[adId] ?? null;
}
