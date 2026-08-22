// src/modules/vendas/autonomia.ts
// Decide a faixa de autonomia da Eva (spec §2.3, §4.3). PURO.
// Consumo-ALVO = fatura atual OU carga futura declarada — nunca corta pela fatura de hoje.
import { parseNumeroBr } from './tabela-precos-parser.js';

export const FAIXA_AUTONOMA = { min: 500, max: 1500 } as const;

export type Faixa = 'autonoma' | 'chama_junior' | 'fluxo_atual' | 'sem_dados';

// Consumo chega escrito por gente ("1.050 kWh"): o mesmo leitor pt-BR do preço
// evita ler mil e cinquenta como 1,05.
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseNumeroBr(v) : Number(v);
  return n !== null && Number.isFinite(n) && n > 0 ? n : null;
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
// Faixa do meio revisada pelo Junior em 22/08: 0,80 → 0,85 R$/Wp.
const SERVICO_POR_FAIXA: ReadonlyArray<{ ateKwh: number; rsPorWp: number }> = [
  { ateKwh: 700,  rsPorWp: 0.95 },
  { ateKwh: 1000, rsPorWp: 0.85 },
  { ateKwh: Infinity, rsPorWp: 0.70 },
];

export function servicoRsPorWp(consumoAlvoKwh: number): number {
  return (SERVICO_POR_FAIXA.find(f => consumoAlvoKwh < f.ateKwh) ?? SERVICO_POR_FAIXA[SERVICO_POR_FAIXA.length - 1]).rsPorWp;
}
