// Calculadora determinística pra ESTIMATIVA DE LEAD (conversa da Eva).
// Todos os números saem de tabelas vetadas pelo Junior — a Eva NUNCA calcula de cabeça.
// Para a proposta final/precisa, usar calculator.ts (engine completa).

// Tabela de PREÇO do Junior (vetada 18/06). [kWp, R$/Wp].
const TABELA_PRECO: ReadonlyArray<readonly [number, number]> = [
  [3, 3.20], [4, 2.90], [5, 2.71], [6, 2.61], [8, 2.46], [10, 2.36],
  [12, 2.30], [15, 2.20], [20, 2.20], [30, 2.20], [50, 2.20], [75, 2.20],
];

// Dimensionamento (precos-referencia.md): faixa de conta -> faixa de consumo kWh.
const FAIXAS_CONSUMO: ReadonlyArray<{ contaMin: number; contaMax: number; kwhMin: number; kwhMax: number }> = [
  { contaMin: 0,    contaMax: 500,     kwhMin: 200,  kwhMax: 350 },
  { contaMin: 500,  contaMax: 800,     kwhMin: 350,  kwhMax: 550 },
  { contaMin: 800,  contaMax: 1200,    kwhMin: 550,  kwhMax: 850 },
  { contaMin: 1200, contaMax: 2000,    kwhMin: 850,  kwhMax: 1400 },
  { contaMin: 2000, contaMax: Infinity, kwhMin: 1400, kwhMax: 2200 },
];

const KWH_POR_PAINEL = 85;     // geração média mês, painel 670W (Brasília/GO)
const WP_POR_PAINEL = 670;
const FATOR_ECONOMIA = 0.93;   // desconta ~7% (taxa mínima/disponibilidade)

function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y0;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

// Preço total (R$) pra um dado kWp, interpolando a TABELA_PRECO. Clampa nos extremos.
export function precoParaKwp(kWp: number): number {
  const first = TABELA_PRECO[0];
  const last = TABELA_PRECO[TABELA_PRECO.length - 1];
  if (kWp <= first[0]) return Math.round(first[0] * 1000 * first[1]);
  if (kWp >= last[0]) return Math.round(last[0] * 1000 * last[1]);
  for (let i = 0; i < TABELA_PRECO.length - 1; i++) {
    const [k0, rs0] = TABELA_PRECO[i];
    const [k1, rs1] = TABELA_PRECO[i + 1];
    if (kWp >= k0 && kWp <= k1) {
      const rsWp = lerp(kWp, k0, rs0, k1, rs1);
      return Math.round(kWp * 1000 * rsWp);
    }
  }
  return Math.round(kWp * 1000 * last[1]);
}

function consumoPorConta(contaRs: number): number {
  const faixa = FAIXAS_CONSUMO.find(f => contaRs >= f.contaMin && contaRs < f.contaMax)
    ?? FAIXAS_CONSUMO[FAIXAS_CONSUMO.length - 1];
  const max = faixa.contaMax === Infinity ? faixa.contaMin * 2 : faixa.contaMax;
  return Math.round(lerp(contaRs, faixa.contaMin, faixa.kwhMin, max, faixa.kwhMax));
}

export interface EstimativaLead {
  consumoKwh: number;
  paineis: number;
  kWp: number;
  precoRs: number;
  economiaMensalRs: number;
}

export function estimarPorConta(contaRs: number): EstimativaLead {
  const consumoKwh = consumoPorConta(contaRs);
  const paineis = Math.max(1, Math.round(consumoKwh / KWH_POR_PAINEL));
  const kWp = Math.round(paineis * WP_POR_PAINEL / 10) / 100;
  const precoRs = precoParaKwp(kWp);
  const economiaMensalRs = Math.round(contaRs * FATOR_ECONOMIA);
  return { consumoKwh, paineis, kWp, precoRs, economiaMensalRs };
}
