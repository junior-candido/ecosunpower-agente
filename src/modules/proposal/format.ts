// src/modules/proposal/format.ts
// Formatadores compartilhados entre os layouts de proposta (solar, serviço, comparação).
// Extraídos de template.ts — comportamento idêntico.

// Rede de segurança: a proposta é caminho CRÍTICO (cliente) e não pode falhar por
// um número faltando. Se algum campo chega null/undefined/NaN (bug a montante),
// degrada pra 0 e LOGA — em vez de derrubar a geração inteira com
// "Cannot read properties of null (reading 'toLocaleString')". O warn deixa
// rastro pra consertar a origem (que deveria ter mandado o número certo).
function numSeguro(n: unknown, ctx: string): number {
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  console.warn(`[proposal/format] valor não-numérico em ${ctx} — usando 0:`, n);
  return 0;
}

export const fmtRs = (n: number, frac = 2) =>
  numSeguro(n, 'fmtRs').toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
export const fmtNum = (n: number, frac = 0) =>
  numSeguro(n, 'fmtNum').toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac });
export const fmtPct = (n: number, frac = 1) =>
  numSeguro(n, 'fmtPct').toLocaleString('pt-BR', { minimumFractionDigits: frac, maximumFractionDigits: frac }) + '%';

// Formata valor grande pra notacao curta (R$ 38,5k / R$ 1,2M).
export function fmtCurto(n: number): string {
  const v = numSeguro(n, 'fmtCurto');
  if (v >= 1_000_000) return 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (v >= 1_000) return 'R$ ' + (v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return 'R$ ' + fmtRs(v, 0);
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]!);
}
