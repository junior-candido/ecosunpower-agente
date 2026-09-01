// Calculadora determinística pra ESTIMATIVA DE LEAD (conversa da assistente).
// Todos os números saem de tabelas vetadas pelo Junior — a assistente NUNCA
// calcula de cabeça. Para a proposta final/precisa, usar calculator.ts.
import { empresa, type EmpresaConfig } from '../empresa-config.js';
import {
  FATOR_PERDA_CONSERVADOR, PERCENTUAL_GERACAO_INJETADA, CUSTO_ILUMINACAO_PUBLICA,
  percentualFioBVigente, hspPorConcessionaria, tarifaPorConcessionaria, tusdFioBPorConcessionaria,
} from '../solar-params.js';
import { calcularContaMensalDetalhada } from './calculator.js';

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

const WP_POR_PAINEL = 670;

// Geração média do painel no mês, pela REGIÃO da empresa (31/08/2026).
// Antes era a constante 85, comentada no próprio código como "(Brasília/GO)" —
// e ela foi usada num lead da Bahia. Agora sai da fonte única (solar-params),
// com o HSP de quem está atendendo. Confere pra Brasília: 0,67 × 5,40 × 0,78 ×
// 30 = 84,7 ≈ os 85 de antes, então o tamanho dos sistemas do DF não muda.
function kwhPorPainelMes(hsp: number): number {
  return (WP_POR_PAINEL / 1000) * hsp * FATOR_PERDA_CONSERVADOR * 30;
}

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
  /** 'informado' = kWh que o cliente/conta deu · 'estimado' = chute pela faixa de R$. */
  consumoOrigem: 'informado' | 'estimado';
  paineis: number;
  kWp: number;
  precoRs: number;
  /** true quando o sistema é MENOR que a menor faixa da tabela (3 kWp): o preço
   *  devolvido é o do piso da tabela, não o do sistema. Quem for falar com o
   *  cliente precisa saber disso antes de dar o número. */
  precoForaDaTabela: boolean;
  economiaMensalRs: number;
  /** O que continua vindo na fatura depois do sistema (Fio B + iluminação). */
  contaResidualRs: number;
}

export interface EntradaEstimativa {
  contaRs: number;
  /** kWh REAL (o cliente falou ou a conta mostrou). Manda mais que o chute. */
  consumoKwh?: number | null;
  /** kWh que o cliente disse que vai passar a gastar (ar-condicionado, carro...). */
  cargaFuturaKwh?: number | null;
  /** Cidade ou concessionária, pra pegar HSP/tarifa/Fio B certos. */
  regiao?: string | null;
  /** Config da empresa que está atendendo; default = a da mensagem em curso. */
  cfg?: EmpresaConfig;
  /** Ano vigente do Fio B (Lei 14.300). Default: o ano de hoje. */
  ano?: number;
}

/**
 * Estimativa de lead — determinística, das tabelas vetadas pelo Junior.
 *
 * Mudou em 31/08/2026 (caso Claudio, Vitória da Conquista-BA):
 *  - o kWh informado passa na frente do chute pela faixa de R$;
 *  - carga futura entra no dimensionamento (nunca sai sistema pro consumo de hoje
 *    quando o cliente já avisou que vai somar ar-condicionado/indução);
 *  - geração do painel vem do HSP da REGIÃO de quem atende, não de Brasília fixo;
 *  - economia é conta − conta residual (Fio B + iluminação pública), pela MESMA
 *    função da proposta formal — antes era 93% da conta no chute.
 */
export function estimarLead(entrada: EntradaEstimativa): EstimativaLead {
  const cfg = entrada.cfg ?? empresa();
  const hsp = hspPorConcessionaria(entrada.regiao, cfg);
  const tarifa = tarifaPorConcessionaria(entrada.regiao, cfg);
  const tusdFioB = tusdFioBPorConcessionaria(entrada.regiao, cfg);

  const informado = positivo(entrada.consumoKwh);
  const futuro = positivo(entrada.cargaFuturaKwh);
  const base = informado ?? consumoPorConta(entrada.contaRs);
  // Dimensiona pelo MAIOR: quem avisou que vai gastar mais não pode receber
  // sistema do tamanho do consumo de hoje.
  const consumoKwh = Math.max(base, futuro ?? 0);

  const porPainel = kwhPorPainelMes(hsp);
  const paineis = Math.max(1, Math.round(consumoKwh / porPainel));
  const kWp = Math.round(paineis * WP_POR_PAINEL / 10) / 100;
  const precoRs = precoParaKwp(kWp);
  const precoForaDaTabela = kWp < TABELA_PRECO[0][0];

  const conta = calcularContaMensalDetalhada({
    consumoKwh,
    geracaoKwh: paineis * porPainel,
    tarifaRsKwh: tarifa,
    tusdFioBRsKwh: tusdFioB,
    percentualFioBVigente: percentualFioBVigente(entrada.ano ?? new Date().getFullYear()),
    percentualGeracaoInjetada: PERCENTUAL_GERACAO_INJETADA,
    custoIluminacaoPublica: CUSTO_ILUMINACAO_PUBLICA,
    tipoSistema: 'on_grid',
  });
  // A economia é do bolso do cliente: nunca passa do que ele paga hoje.
  const contaResidualRs = Math.min(entrada.contaRs, Math.round(conta.total * 100) / 100);
  const economiaMensalRs = Math.round((entrada.contaRs - contaResidualRs) * 100) / 100;

  return {
    consumoKwh,
    consumoOrigem: informado != null ? 'informado' : 'estimado',
    paineis, kWp, precoRs, precoForaDaTabela,
    economiaMensalRs, contaResidualRs,
  };
}

function positivo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Compatibilidade: quem só tem o valor da conta na mão. */
export function estimarPorConta(contaRs: number): EstimativaLead {
  return estimarLead({ contaRs });
}
