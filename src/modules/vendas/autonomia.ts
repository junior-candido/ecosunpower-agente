// src/modules/vendas/autonomia.ts
// Decide a faixa de autonomia da Eva (spec §2.3, §4.3). PURO.
// Consumo-ALVO = fatura atual OU carga futura declarada — nunca corta pela fatura de hoje.

export const FAIXA_AUTONOMA = { min: 500, max: 1500 } as const;

export type Faixa = 'autonoma' | 'chama_junior' | 'fluxo_atual' | 'sem_dados';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function consumoAlvo(p: { consumoKwh?: unknown; cargaFuturaKwh?: unknown }): number | null {
  const a = num(p.consumoKwh);
  const b = num(p.cargaFuturaKwh);
  if (a === null && b === null) return null;
  return Math.max(a ?? 0, b ?? 0);
}

export function decidirFaixa(consumoAlvoKwh: number | null): Faixa {
  if (consumoAlvoKwh === null) return 'sem_dados';
  if (consumoAlvoKwh < FAIXA_AUTONOMA.min) return 'fluxo_atual';
  if (consumoAlvoKwh > FAIXA_AUTONOMA.max) return 'chama_junior';
  return 'autonoma';
}

// Tabela de serviço aprovada 21/08 (referência Greener jun/2025).
const SERVICO_POR_FAIXA: ReadonlyArray<{ ateKwh: number; rsPorWp: number }> = [
  { ateKwh: 700,  rsPorWp: 0.95 },
  { ateKwh: 1000, rsPorWp: 0.80 },
  { ateKwh: Infinity, rsPorWp: 0.70 },
];

export function servicoRsPorWp(consumoAlvoKwh: number): number {
  return (SERVICO_POR_FAIXA.find(f => consumoAlvoKwh < f.ateKwh) ?? SERVICO_POR_FAIXA[SERVICO_POR_FAIXA.length - 1]).rsPorWp;
}
