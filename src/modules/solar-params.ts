// FONTE UNICA da verdade dos parametros solares.
// Usada pela PROPOSTA formal (calculator.ts/proposal-assistant.ts) E pela EVA
// atendente (solar.ts) — pra os dois NUNCA divergirem (regra do Junior, 04/06/2026).
//
// PRINCIPIO: geracao estimada propositalmente CONSERVADORA. O cliente deve
// receber MAIS do que foi prometido ("prometeu pouco, entregou muito" = cliente
// satisfeito ao abrir a conta). Por isso HSP no lado baixo + fator de perda alto.
//
// Base de irradiacao: Atlas Brasileiro de Energia Solar (LABREN/INPE), a mesma
// fonte do CRESESB. Valores mantidos no lado conservador de proposito.

import { empresa } from './empresa-config.js';

// Potencia da placa padrao usada nas estimativas (Watts por modulo).
// Junior trabalha hoje com 620W a 725W; a MAIORIA das vendas e 700-725W, sendo
// o 700W Risen o mais usado. Placas de ~540W estao ultrapassadas — ficam so como
// referencia de legado/upgrade (PAINEL_LEGADO_W), nao como padrao de venda.
// Serve so pra estimar QUANTAS placas tem o sistema (kWp / potencia da placa).
export const PAINEL_PADRAO_W = 700;

// Faixa de potencia de placa que o Junior comercializa hoje (validacao de sanidade).
export const PAINEL_W_MIN = 620;
export const PAINEL_W_MAX = 725;

// Placa antiga (so pra cenarios de upgrade de sistema existente).
export const PAINEL_LEGADO_W = 540;

// Fator de perda (inversor + cabo + temperatura + sujeira). Calibrado por Junior
// (04/06/2026) em 0.78: pessimista o bastante pra o cliente receber ~5% a mais do
// que foi prometido (surpresa boa), mas SEM ficar muito abaixo do numero que a
// concorrencia mostra. Equilibrio surpresa x competitividade. Real ~0.82.
export const FATOR_PERDA_CONSERVADOR = 0.78;

// Tolerancia de coerencia entre R$ da conta e kWh. Absorve impostos, bandeiras
// e iluminacao publica. Desvio acima disso => NAO confiar na leitura, confirmar
// o consumo com o cliente em vez de inventar.
export const TOLERANCIA_COERENCIA = 0.35;

// Parametros de projecao COMPARTILHADOS (chat + proposta usam os mesmos — antes
// o chat usava reajuste 0.08 e a proposta 0.10, divergencia que o code review pegou).
export const REAJUSTE_ANUAL_ENERGIA = 0.10;      // inflacao anual da tarifa (~10% Brasil)
export const PERCENTUAL_GERACAO_INJETADA = 0.70; // residencial sem bateria injeta ~70% na rede
export const CUSTO_ILUMINACAO_PUBLICA = 35;      // R$/mes fixo na fatura
export const VIDA_UTIL_ANOS = 25;

interface ParamsConcessionaria {
  hsp: number;       // h/dia (HSP conservador)
  tarifa: number;    // R$/kWh tarifa cheia media (com impostos)
  tusdFioB: number;  // R$/kWh TUSD Fio B (Lei 14.300) — cliente paga sobre o injetado
}

// Default regional. A EcoSunPower SO atende DF + Entorno GO, e toda essa regiao
// tem HSP ~5.4 (CRESESB). Entao mesmo cidade nao-reconhecida pelo nome (ex.: RA do
// DF "Taguatinga" ou cidade GO "Luziania", que nao contem DF/GO/Goias no texto)
// usa o HSP regional correto — nunca o 5.0 pessimista de antes (regressao do review).
// Tarifa/Fio B ficam no meio-termo quando nao da pra distinguir DF de GO.
const DEFAULT_PARAMS: ParamsConcessionaria = { hsp: 5.40, tarifa: 1.03, tusdFioB: 0.29 };

// Reconhecimento por concessionaria OU cidade/UF (a Eva nem sempre tem a
// concessionaria exata, mas tem a cidade). DF -> Neoenergia, GO -> Equatorial.
const POR_CONCESSIONARIA: Array<{ match: RegExp; params: ParamsConcessionaria }> = [
  // HSP Brasilia = 5.40: media das 4 opcoes do CRESESB SunData (horizontal 5.28,
  // angulo=latitude 5.47, maior media anual 5.47, maior minimo mensal 5.37).
  // Dado real (nao chute). O conservadorismo vem do fator de perda 0.78, nao de um HSP baixo.
  { match: /neoenergia|\bceb\b|bras[íi]lia|distrito federal|\bdf\b/i, params: { hsp: 5.40, tarifa: 1.05, tusdFioB: 0.30 } },
  // HSP GO = 5.41: media das 4 opcoes do CRESESB SunData p/ Cidade Ocidental-GO
  // (horizontal 5.28, angulo=latitude 5.48, maior media 5.49, maior minimo 5.38).
  { match: /equatorial|\bcelg\b|goi[áa]s|\bgo\b/i, params: { hsp: 5.41, tarifa: 1.00, tusdFioB: 0.28 } },
];

function resolver(concessionariaOuCidade?: string | null): ParamsConcessionaria {
  if (concessionariaOuCidade) {
    const hit = POR_CONCESSIONARIA.find(p => p.match.test(concessionariaOuCidade));
    if (hit) return hit.params;
  }
  // [ECOSOF] Cidade/UF fora do mapa DF/GO: um clone de outra região pode
  // definir hsp_padrao/tarifa_kwh_padrao na empresa_config (lidos em RUNTIME).
  // EcoSun deixa os 2 como null no seed -> cai no DEFAULT_PARAMS de sempre
  // (comportamento idêntico ao antigo).
  const e = empresa();
  if (e.hspPadrao != null || e.tarifaPadrao != null) {
    return {
      hsp: e.hspPadrao ?? DEFAULT_PARAMS.hsp,
      tarifa: e.tarifaPadrao ?? DEFAULT_PARAMS.tarifa,
      tusdFioB: DEFAULT_PARAMS.tusdFioB,
    };
  }
  return DEFAULT_PARAMS;
}

// [ECOSOF] Nome da concessionária default quando a cidade/UF não resolve pelo
// mapa acima: clone pode setar concessionaria_padrao na empresa_config.
// Retorna null quando não há default configurado (comportamento atual).
export function concessionariaPadraoEmpresa(): string | null {
  return empresa().concessionariaPadrao;
}

export function hspPorConcessionaria(concessionariaOuCidade?: string | null): number {
  return resolver(concessionariaOuCidade).hsp;
}

export function tarifaPorConcessionaria(concessionariaOuCidade?: string | null): number {
  return resolver(concessionariaOuCidade).tarifa;
}

export function tusdFioBPorConcessionaria(concessionariaOuCidade?: string | null): number {
  return resolver(concessionariaOuCidade).tusdFioB;
}

// Percentual do Fio B vigente por ano (Lei 14.300/2022). 2026 = 60%.
export function percentualFioBVigente(ano: number): number {
  const cronograma: Record<number, number> = {
    2024: 0.30, 2025: 0.45, 2026: 0.60, 2027: 0.75, 2028: 0.90,
  };
  if (ano <= 2023) return 0.30;
  if (ano >= 2029) return 1.0;
  return cronograma[ano] ?? 0.60;
}

// Estima consumo (kWh/mes) a partir do valor da conta. Aproximacao simples
// (valor / tarifa cheia). Use sempre que possivel o kWh REAL impresso na conta.
export function estimarConsumoDeConta(monthlyBill: number, tarifa: number): number {
  if (monthlyBill <= 0 || tarifa <= 0) return 0;
  return Math.round(monthlyBill / tarifa);
}

export interface CoerenciaResultado {
  coerente: boolean;
  consumoEsperado: number; // kWh esperado pela conta/tarifa
  desvioPct: number;       // 0..1 (fracao de desvio do consumo lido vs esperado)
}

// Confere se o consumo lido bate com o valor da conta pela tarifa.
// Caso Marcelo: R$490 + 85 kWh => esperado ~467, desvio ~82% => INCOERENTE.
// Caso ok: R$490 + 467 kWh => desvio ~0% => coerente.
export function checarCoerenciaContaConsumo(
  monthlyBill: number,
  consumptionKwh: number,
  tarifa: number,
): CoerenciaResultado {
  const consumoEsperado = estimarConsumoDeConta(monthlyBill, tarifa);
  if (consumoEsperado <= 0 || consumptionKwh <= 0) {
    return { coerente: false, consumoEsperado, desvioPct: 1 };
  }
  const desvioPct = Math.abs(consumptionKwh - consumoEsperado) / consumoEsperado;
  return { coerente: desvioPct <= TOLERANCIA_COERENCIA, consumoEsperado, desvioPct };
}
