// src/modules/proposal/format.ts
// Formatadores compartilhados entre os layouts de proposta (solar, serviço, comparação).
// Extraídos de template.ts — comportamento idêntico.

export const fmtRs = (n: number, frac = 2) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
export const fmtNum = (n: number, frac = 0) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
export const fmtPct = (n: number, frac = 1) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac }) + '%';

// Formata valor grande pra notacao curta (R$ 38,5k / R$ 1,2M).
export function fmtCurto(n: number): string {
  if (n >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (n >= 1_000) return 'R$ ' + (n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return 'R$ ' + fmtRs(n, 0);
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]!);
}
