// Tracking de origem de lead via tags em wa.me links.
//
// Fluxo:
// 1) Agente de marketing gera posts com link wa.me/{phone}?text=<texto+tag>
// 2) Cliente clica, WhatsApp abre com texto pre-preenchido contendo a tag
// 3) Cliente envia primeira mensagem (com ou sem editar)
// 4) handleTextMessage detecta tag, classifica lead_source + utm_*
//
// Formato da tag: #<type>-<id>
//   type = ig | fb | ad | rem
//   id = alfanumerico curto identificador do post/campanha/lead original

export type TrackingSource =
  | 'organico_ig'
  | 'organico_fb'
  | 'ad_ig_cta_wa'
  | 'ad_fb_cta_wa'
  | 'reengajamento_link'
  | 'direto';

export interface TrackingParsed {
  source: TrackingSource;
  campaign: string;        // string completa tipo "ig-a3f5c1"
  content?: string;        // id curto do post/campanha
  rawTag: string;          // tag bruta encontrada (#ig-a3f5c1)
}

// Aceita tipos: ig (organic Instagram), fb (organic Facebook), post (generic
// organic post — quando nao sabemos plataforma, detecta cruzando com marketing_drafts),
// ad (paid ad CTA), rem (reengajamento)
const TAG_RE = /#(ig|fb|post|ad|rem)-([a-z0-9]{4,20})\b/i;
// post-hoc: tag tipo "post" e gerada por randomBytes(3) em hex, entao exige
// EXATAMENTE 6 chars hex pra reduzir falso-positivo com palavras comuns
// (ex: "#post-hoje" nao bate, "#ig-brasilia" nao bate).
const POST_ID_RE = /^[a-f0-9]{6}$/;

// Detecta tag em uma mensagem. Retorna null se nao achar.
export function parseTrackingTag(text: string): TrackingParsed | null {
  const match = text.match(TAG_RE);
  if (!match) return null;

  const type = match[1].toLowerCase();
  const id = match[2].toLowerCase();
  const rawTag = match[0];

  // Validacao post-hoc: tipo "post" requer formato hex exato.
  // Protege contra falso-positivo em palavras comuns do portugues.
  if (type === 'post' && !POST_ID_RE.test(id)) return null;

  const sourceMap: Record<string, TrackingSource> = {
    ig: 'organico_ig',
    fb: 'organico_fb',
    post: 'organico_ig', // generic organic post — default IG (primary channel)
    ad: 'ad_ig_cta_wa', // fallback pra ad_*, pode ser refinado se tivermos meta
    rem: 'reengajamento_link',
  };

  return {
    source: sourceMap[type] ?? 'direto',
    campaign: `${type}-${id}`,
    content: id,
    rawTag,
  };
}

// Constroi wa.me URL com texto pre-preenchido + tag de tracking.
export function buildTrackedWaLink(
  phone: string,
  prefilledIntro: string,
  type: 'ig' | 'fb' | 'post' | 'ad' | 'rem',
  id: string,
): string {
  // Sanitiza phone (so digitos)
  const cleanPhone = phone.replace(/\D/g, '');
  const tag = `#${type}-${id.toLowerCase()}`;
  const text = `${prefilledIntro} ${tag}`;
  const encoded = encodeURIComponent(text);
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}
