// src/modules/dashboard/ui/html.ts
// Base do design system do Command Center: escape e formatação de número.
//
// REGRA DE OURO (Junior): nada de número inventado. Sem dado → "—".
// Este arquivo NÃO importa nada do dashboard (views.ts reexporta o escape daqui),
// pra não criar import circular com os componentes.

/** Escapa o que vem de dado antes de ir pro HTML (evita XSS). */
export function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Travessão usado em todo lugar em que falta o dado. */
export const SEM_DADO = '—';

export function temNumero(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Número no formato brasileiro (1.234,5). Sem dado → "—". */
export function fmtNumero(v: number | null | undefined, casas = 0): string {
  if (!temNumero(v)) return SEM_DADO;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Número grande em forma curta: 284.800 → "284,8" + "mil"; 1.240.000 → "1,24" + "mi". */
export function fmtCompacto(v: number | null | undefined): { numero: string; sufixo: string } {
  if (!temNumero(v)) return { numero: SEM_DADO, sufixo: '' };
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return { numero: fmtNumero(v / 1_000_000, 2), sufixo: 'mi' };
  if (abs >= 1_000) return { numero: fmtNumero(v / 1_000, 1), sufixo: 'mil' };
  return { numero: fmtNumero(v, 0), sufixo: '' };
}

/** Só aceita link interno (/…) ou http(s). Qualquer outra coisa (javascript:, data:) some. */
export function hrefSeguro(href: string | null | undefined): string | null {
  if (!href) return null;
  const h = href.trim();
  if (h.startsWith('/') && !h.startsWith('//')) return h;
  if (/^https?:\/\//i.test(h)) return h;
  return null;
}
