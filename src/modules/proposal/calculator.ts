// Engine de calculo de propostas EcoSunPower
// Funcoes puras: dimensionamento, geracao, economia, payback, TIR, ROI, projecao 25a.
// Ver tambem: conhecimento/propostas.md (regras + defaults).

export interface ProposalInput {
  // Sistema
  potenciaKwp: number;
  fatorPerda: number; // 0.75 - 0.85, Junior decide caso a caso
  hsp: number; // h/dia, default Brasilia 5.2

  // Consumo & tarifa
  consumoMensalKwh: number;
  tarifaRsKwh: number;
  custoDisponibilidadeMensal: number; // R$/mes, mesmo apos solar
  reajusteAnualEnergia: number; // ex: 0.10 = 10%

  // Investimento
  valorTotalRs: number;

  // Outros parametros
  vidaUtilAnos: number; // default 25
}

export interface ProposalCalculations {
  // Geracao
  geracaoMensalKwh: number;
  geracaoAnualKwh: number;
  geracaoVidaUtilKwh: number;

  // Economia
  contaSemSistemaMensal: number;
  contaComSistemaMensal: number;
  economiaMensal: number;
  economiaAnual: number;
  economiaVidaUtil: number;

  // Indicadores
  paybackAnos: number;
  paybackMeses: number;
  paybackInviavel: boolean; // true quando nao paga dentro da vida util
  roiVezes: number;
  tirPercentual: number;
  rsPorWp: number;

  // Sustentabilidade
  co2EvitadoToneladas: number;

  // Projecao mes a mes (12 meses)
  geracaoMensalDistribuida: number[];
  consumoMensalDistribuido: number[];

  // Projecao anual (vida util)
  fluxoCaixaAnual: number[];
  contaSemSistemaAnual: number[];
  contaComSistemaAnual: number[];
}

// Sazonalidade Brasilia: pico em set-out, vale em mai-jun.
// Multiplicadores aplicados sobre a media mensal pra simular variacao real.
const SAZONALIDADE_DF = [
  1.13, 1.09, 1.04, 0.97, 0.90, 0.85,
  0.91, 0.98, 1.05, 1.09, 1.12, 1.14,
] as const;

export function calcularGeracaoMensal(
  potenciaKwp: number,
  hsp: number,
  fatorPerda: number,
): number {
  return potenciaKwp * hsp * 30 * fatorPerda;
}

export function calcularGeracaoMensalDistribuida(geracaoMediaMensal: number): number[] {
  return SAZONALIDADE_DF.map(s => Math.round(geracaoMediaMensal * s));
}

export function calcularContaMensal(
  consumoKwh: number,
  geracaoKwh: number,
  tarifaRsKwh: number,
  custoDisponibilidade: number,
): number {
  // Quando geracao >= consumo, paga so disponibilidade (TUSD min ou Fio B)
  const consumoLiquido = Math.max(0, consumoKwh - geracaoKwh);
  return Math.max(custoDisponibilidade, consumoLiquido * tarifaRsKwh);
}

// TIR via metodo Newton-Raphson. Aproximacao iterativa do zero do VPL.
// Boa o suficiente pra propostas (precisao ~0.01%).
export function calcularTIR(fluxoCaixa: number[]): number {
  let taxa = 0.1; // chute inicial 10%
  for (let i = 0; i < 100; i++) {
    let vpl = 0;
    let derivada = 0;
    for (let t = 0; t < fluxoCaixa.length; t++) {
      const fator = Math.pow(1 + taxa, t);
      vpl += fluxoCaixa[t] / fator;
      if (t > 0) derivada += -t * fluxoCaixa[t] / (fator * (1 + taxa));
    }
    if (Math.abs(vpl) < 0.01) break;
    if (derivada === 0) break;
    taxa = taxa - vpl / derivada;
    if (taxa < -0.99) taxa = -0.99;
  }
  return taxa;
}

// Calcula payback considerando reajuste anual da energia (economia cresce ano a ano).
// Retorna fracao de anos (ex: 3.25 = 3 anos e 3 meses).
export function calcularPayback(
  investimento: number,
  economiaAnualInicial: number,
  reajusteAnual: number,
  maxAnos = 30,
): number {
  let acumulado = 0;
  let anoAtual = 0;
  let economiaAno = economiaAnualInicial;
  while (acumulado < investimento && anoAtual < maxAnos) {
    if (acumulado + economiaAno >= investimento) {
      // Frac do ano corrente
      const restante = investimento - acumulado;
      return anoAtual + (restante / economiaAno);
    }
    acumulado += economiaAno;
    economiaAno *= (1 + reajusteAnual);
    anoAtual += 1;
  }
  return maxAnos; // nao paga em maxAnos
}

export function calcular(input: ProposalInput): ProposalCalculations {
  const {
    potenciaKwp,
    fatorPerda,
    hsp,
    consumoMensalKwh,
    tarifaRsKwh,
    custoDisponibilidadeMensal,
    reajusteAnualEnergia,
    valorTotalRs,
    vidaUtilAnos,
  } = input;

  // Geracao
  const geracaoMensalKwh = calcularGeracaoMensal(potenciaKwp, hsp, fatorPerda);
  const geracaoAnualKwh = geracaoMensalKwh * 12;
  const geracaoVidaUtilKwh = geracaoAnualKwh * vidaUtilAnos;

  // Distribuicao mensal (sazonalidade)
  const geracaoMensalDistribuida = calcularGeracaoMensalDistribuida(geracaoMensalKwh);
  const consumoMensalDistribuido = Array(12).fill(consumoMensalKwh);

  // Conta mensal sem/com sistema
  const contaSemSistemaMensal = consumoMensalKwh * tarifaRsKwh;
  const contaComSistemaMensal = calcularContaMensal(
    consumoMensalKwh, geracaoMensalKwh, tarifaRsKwh, custoDisponibilidadeMensal,
  );
  const economiaMensal = contaSemSistemaMensal - contaComSistemaMensal;
  const economiaAnual = economiaMensal * 12;

  // Projecao anual (vida util) com reajuste 10%/ano na energia
  const fluxoCaixaAnual: number[] = [-valorTotalRs];
  const contaSemSistemaAnual: number[] = [];
  const contaComSistemaAnual: number[] = [];
  let economiaAcum = 0;
  for (let ano = 1; ano <= vidaUtilAnos; ano++) {
    const reajuste = Math.pow(1 + reajusteAnualEnergia, ano - 1);
    const semSistAno = contaSemSistemaMensal * 12 * reajuste;
    const comSistAno = contaComSistemaMensal * 12 * reajuste;
    const econAno = semSistAno - comSistAno;
    contaSemSistemaAnual.push(semSistAno);
    contaComSistemaAnual.push(comSistAno);
    fluxoCaixaAnual.push(econAno);
    economiaAcum += econAno;
  }

  // Indicadores
  const paybackBruto = calcularPayback(valorTotalRs, economiaAnual, reajusteAnualEnergia);
  // Se nao paga em vidaUtil, marca como inviavel pra template renderizar aviso.
  const paybackInviavel = paybackBruto >= vidaUtilAnos;
  const paybackAnos = paybackInviavel ? vidaUtilAnos : Math.floor(paybackBruto);
  const paybackMeses = paybackInviavel ? 0 : Math.round((paybackBruto % 1) * 12);
  const roiVezes = economiaAcum / valorTotalRs;
  const tirPercentual = calcularTIR(fluxoCaixaAnual) * 100;
  const rsPorWp = valorTotalRs / (potenciaKwp * 1000);

  // Sustentabilidade (matriz brasileira ~0.084 kg CO2/kWh)
  const co2EvitadoToneladas = (geracaoVidaUtilKwh * 0.084) / 1000;

  return {
    geracaoMensalKwh,
    geracaoAnualKwh,
    geracaoVidaUtilKwh,
    contaSemSistemaMensal,
    contaComSistemaMensal,
    economiaMensal,
    economiaAnual,
    economiaVidaUtil: economiaAcum,
    paybackAnos,
    paybackMeses,
    paybackInviavel,
    roiVezes,
    tirPercentual,
    rsPorWp,
    co2EvitadoToneladas,
    geracaoMensalDistribuida,
    consumoMensalDistribuido,
    fluxoCaixaAnual,
    contaSemSistemaAnual,
    contaComSistemaAnual,
  };
}

// Tabela Greener jan/2026 - referencia de R$/Wp por faixa kWp.
// Ver tambem mercado-greener-2026.md.
const GREENER_2026: Array<{ minKwp: number; maxKwp: number; rsPorWp: number }> = [
  { minKwp: 0,    maxKwp: 3,    rsPorWp: 3.44 },
  { minKwp: 3,    maxKwp: 6,    rsPorWp: 2.66 },
  { minKwp: 6,    maxKwp: 12,   rsPorWp: 2.21 },
  { minKwp: 12,   maxKwp: 30,   rsPorWp: 2.21 },
  { minKwp: 30,   maxKwp: 75,   rsPorWp: 2.21 },
  { minKwp: 75,   maxKwp: 150,  rsPorWp: 2.20 },
  { minKwp: 150,  maxKwp: 300,  rsPorWp: 2.20 },
  { minKwp: 300,  maxKwp: 500,  rsPorWp: 2.20 },
  { minKwp: 500,  maxKwp: 1000, rsPorWp: 2.27 },
  { minKwp: 1000, maxKwp: Infinity, rsPorWp: 2.85 },
];

export interface GreenerComparison {
  rsPorWpReferencia: number;
  diferencaPct: number;
  classificacao: 'abaixo' | 'media' | 'premium' | 'muito_acima';
  rotulo: string;
  recomendacao: string;
}

export function compararGreener(potenciaKwp: number, rsPorWpFinal: number): GreenerComparison {
  const faixa = GREENER_2026.find(f => potenciaKwp >= f.minKwp && potenciaKwp < f.maxKwp)
    ?? GREENER_2026[GREENER_2026.length - 1];
  const ref = faixa.rsPorWp;
  const diff = (rsPorWpFinal / ref - 1) * 100;
  let classificacao: GreenerComparison['classificacao'];
  let rotulo: string;
  let recomendacao: string;
  if (diff < -10) {
    classificacao = 'abaixo';
    rotulo = '⚠️ Abaixo do mercado';
    recomendacao = 'Considere aumentar margem — você tem espaço.';
  } else if (diff <= 10) {
    classificacao = 'media';
    rotulo = '✅ Na média';
    recomendacao = 'Posicione o diferencial: marcas Tier 1, garantia, suporte EcoSunPower.';
  } else if (diff <= 25) {
    classificacao = 'premium';
    rotulo = '💎 Premium';
    recomendacao = 'Justifica: TOPCon/N-Type, otimizadores SolarEdge, ART, garantia 30 anos.';
  } else {
    classificacao = 'muito_acima';
    rotulo = '🚨 Muito acima do mercado';
    recomendacao = 'Reveja custos ou ajuste margem — risco de perder a venda.';
  }
  return { rsPorWpReferencia: ref, diferencaPct: diff, classificacao, rotulo, recomendacao };
}
