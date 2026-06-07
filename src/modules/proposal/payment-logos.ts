// src/modules/proposal/payment-logos.ts
// Selos dos meios de pagamento em HTML/CSS (embutido — real, brasileiro, sem cara
// de IA, e robusto no PDF do Puppeteer, diferente de fonte em SVG). Vão embaixo de
// cada forma de pagamento: PIX nas formas PIX, bandeiras de cartão no cartão.

// Selo PIX: losango teal oficial (#32BCAD) + wordmark "Pix".
const PIX_BADGE = `<span style="display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:5px 11px">
  <span style="width:13px;height:13px;background:#32BCAD;border-radius:3px;display:inline-block;transform:rotate(45deg)"></span>
  <span style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:#32BCAD;font-size:14px;line-height:1">Pix</span>
</span>`;

// Bandeiras de cartão: Mastercard (2 círculos), VISA (wordmark) e elo (selo).
const CARD_BADGES = `<span style="display:inline-flex;align-items:center;gap:10px">
  <span style="position:relative;display:inline-block;width:33px;height:21px">
    <span style="position:absolute;left:0;top:1px;width:19px;height:19px;border-radius:50%;background:#EB001B"></span>
    <span style="position:absolute;left:11px;top:1px;width:19px;height:19px;border-radius:50%;background:#F79E1B;opacity:0.85"></span>
  </span>
  <span style="font-family:Arial,Helvetica,sans-serif;font-style:italic;font-weight:700;color:#1A1F71;font-size:15px;letter-spacing:0.5px;line-height:1">VISA</span>
  <span style="display:inline-block;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:11px;padding:3px 7px;border-radius:4px;line-height:1">elo</span>
</span>`;

// Devolve o bloco de logo (HTML) pra um meio de pagamento. Financiamento/ausente
// não tem selo (string vazia) — financiamento é só no solar e não tem bandeira.
export function logoMeioPagamento(meio?: 'pix' | 'cartao' | 'financiamento'): string {
  const badge = meio === 'pix' ? PIX_BADGE : meio === 'cartao' ? CARD_BADGES : '';
  if (!badge) return '';
  return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #EEF2F6;display:flex;align-items:center">${badge}</div>`;
}
