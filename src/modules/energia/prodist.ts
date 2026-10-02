// src/modules/energia/prodist.ts
//
// PRODIST Módulo 8 — faixas de tensão de leitura (baixa tensão). Tabela da spec
// §5, conferida em 28/09/2026. RECONFERIR na revisão vigente antes de publicar
// qualquer laudo: o Shelly não é analisador classe A e estes números são
// INDICATIVOS, não substituem a medição regulatória da distribuidora.

export type Faixa = 'adequada' | 'precaria' | 'critica';
export type TensaoNominal = 127 | 220 | 380;

const FAIXAS: Record<TensaoNominal, { adeq: [number, number]; prec: [number, number] }> = {
  127: { adeq: [117, 133], prec: [110, 135] },
  220: { adeq: [202, 231], prec: [191, 233] },
  380: { adeq: [350, 399], prec: [331, 403] },
};

/** Mesmo limite de monitoring/proactive-alerts/telemetria-regras.ts (tensao_rede_alta). */
export const LIMITE_DESARME_INVERSOR_V = 242;

export function faixaProdist(v: number | null | undefined, nominal: TensaoNominal | null | undefined): Faixa | null {
  if (v == null || !Number.isFinite(v) || !nominal || !FAIXAS[nominal]) return null;
  const f = FAIXAS[nominal];
  if (v >= f.adeq[0] && v <= f.adeq[1]) return 'adequada';
  if (v >= f.prec[0] && v <= f.prec[1]) return 'precaria';
  return 'critica';
}

/** Limites da faixa (para desenhar as faixas no gráfico). */
export function limitesProdist(nominal: TensaoNominal): { adequada: [number, number]; precaria: [number, number] } {
  const f = FAIXAS[nominal];
  return { adequada: [...f.adeq] as [number, number], precaria: [...f.prec] as [number, number] };
}

/** Nominal de FASE pela mediana medida (inversor não informa): ~127 ou ~220 V. */
export function nominalPelaMediana(valores: number[]): TensaoNominal | null {
  const v = valores.filter((x) => Number.isFinite(x) && x > 50).sort((a, b) => a - b);
  if (!v.length) return null;
  const med = v[Math.floor(v.length / 2)];
  if (med >= 300) return 380;
  return med >= 175 ? 220 : 127;
}
