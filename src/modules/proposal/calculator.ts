// Engine de calculo de propostas EcoSunPower
// Funcoes puras: dimensionamento, geracao, economia, payback, TIR, ROI, projecao 25a.
// Ver tambem: conhecimento/propostas.md (regras + defaults).

export interface ProposalInput {
  // Sistema
  potenciaKwp: number;
  fatorPerda: number; // 0.75 - 0.85, Junior decide caso a caso
  hsp: number; // h/dia, default Brasilia 5.40 (CRESESB, via solar-params.ts)

  // Consumo & tarifa
  consumoMensalKwh: number;
  tarifaRsKwh: number;
  reajusteAnualEnergia: number; // ex: 0.10 = 10%

  // Fio B (Lei 14.300/2022 — substitui custo disponibilidade pra solar)
  // Em 2026 cliente paga 60% do Fio B sobre o que injeta na rede.
  // Cronograma: 2024=30%, 2025=45%, 2026=60%, 2027=75%, 2028=90%, 2029+=100%.
  tusdFioBRsKwh: number; // ex: Neoenergia DF ~0.30, Equatorial GO ~0.28
  percentualFioBVigente: number; // ex: 2026 = 0.60
  percentualGeracaoInjetada: number; // residencial sem bateria ~0.70 (70% vai pra rede)
  custoIluminacaoPublica: number; // R$/mes, valor fixo da fatura

  // Investimento
  valorTotalRs: number;

  // Outros parametros
  vidaUtilAnos: number; // default 25

  // Override opcional de geracao (PVSol/PVsyst real). Quando setado, calcular()
  // usa esse valor em vez de derivar de kWp×HSP×30×fator. Util pra propostas
  // baseadas em estudo de simulacao do telhado real (com orientacao/sombreamento).
  geracaoMensalKwhOverride?: number;

  // Override opcional de consumo mes a mes (12 valores em kWh). Quando o cliente
  // trouxe historico real da conta de luz dos 12 ultimos meses, usar isso em vez
  // de assumir consumo fixo igual a media. Mostra sazonalidade real do cliente
  // (ar-condicionado verao, ferias dezembro, etc) no grafico Consumo x Geracao.
  // Quando ausente, distribuicao usa Array(12).fill(consumoMensalKwh).
  consumoMensalKwhDistribuidoOverride?: number[];

  // Override opcional de GERACAO mes a mes (12 valores em kWh do estudo PVSol/PVsyst).
  // Quando o estudo dá a geracao mes a mes, usar esses valores no grafico em vez da
  // curva de sazonalidade padrao — assim o cliente ve exatamente o que o estudo
  // mostrou. A media dos 12 vira a geracao mensal usada nos indicadores (payback/ROI).
  geracaoMensalKwhDistribuidoOverride?: number[];
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

// Margem tecnica padrao aplicada sobre o dimensionamento bruto:
// +5% Fio B (Lei 14.300 — energia injetada paga taxa, sistema gera um pouco a mais)
// +3% degradacao ano 1 (placas perdem ~3% no primeiro ano)
// +2% temperatura (placas mais quentes = menos eficientes)
// Total +10% sobre kWp_minimo. Junior pode override falando "sem margem" ou valor exato.
export const MARGEM_TECNICA_DEFAULT = 0.10;

// Dimensiona sistema partindo do consumo. Inversa de calcularGeracaoMensal.
// kWp = consumo / (HSP * 30 * fatorPerda)  -> kWp minimo (cobre 100% do consumo)
// kWp_recomendado = kWp_minimo * (1 + margem)
// quantidadePaineis = ceil(kWp_recomendado * 1000 / painelPotenciaW)  -> sempre pra cima
// kWpReal = quantidadePaineis * painelPotenciaW / 1000   -> potencia depois de arredondar
export interface Dimensionamento {
  kWpMinimo: number;       // teorico, cobre exatamente o consumo
  kWpRecomendado: number;  // com margem tecnica
  quantidadePaineis: number;
  kWpReal: number;         // potencia real instalada (apos arredondamento de paineis)
  margemAplicada: number;
}

export function dimensionarSistema(input: {
  consumoMensalKwh: number;
  painelPotenciaW: number;
  hsp: number;
  fatorPerda: number;
  margem?: number; // default MARGEM_TECNICA_DEFAULT
}): Dimensionamento {
  if (input.consumoMensalKwh <= 0 || input.painelPotenciaW <= 0 || input.hsp <= 0 || input.fatorPerda <= 0) {
    throw new Error('dimensionarSistema: todos os inputs precisam ser positivos');
  }
  const margem = input.margem ?? MARGEM_TECNICA_DEFAULT;
  const kWpMinimo = input.consumoMensalKwh / (input.hsp * 30 * input.fatorPerda);
  const kWpRecomendado = kWpMinimo * (1 + margem);
  const quantidadePaineis = Math.ceil((kWpRecomendado * 1000) / input.painelPotenciaW);
  const kWpReal = (quantidadePaineis * input.painelPotenciaW) / 1000;

  return {
    kWpMinimo: Math.round(kWpMinimo * 100) / 100,
    kWpRecomendado: Math.round(kWpRecomendado * 100) / 100,
    quantidadePaineis,
    kWpReal: Math.round(kWpReal * 100) / 100,
    margemAplicada: margem,
  };
}

export function calcularGeracaoMensalDistribuida(geracaoMediaMensal: number): number[] {
  return SAZONALIDADE_DF.map(s => Math.round(geracaoMediaMensal * s));
}

// Calcula conta mensal pos-solar considerando Fio B (Lei 14.300/2022).
// Fio B = TUSD Fio B (R$/kWh) × kWh injetado × percentual vigente do ano.
// Quando geracao supera consumo, sobra eh injetada na rede e gera credito pra
// abater meses futuros, mas o cliente PAGA Fio B sobre o injetado.
// Cliente sempre paga: Fio B + custo iluminacao publica + (consumo nao-coberto × tarifa).
export function calcularContaMensal(
  consumoKwh: number,
  geracaoKwh: number,
  tarifaRsKwh: number,
  tusdFioBRsKwh: number,
  percentualFioBVigente: number,
  percentualGeracaoInjetada: number,
  custoIluminacaoPublica: number,
): number {
  // Estimativa do que vai pra rede (depende de quando consome — sem bateria,
  // residencial tipico injeta 60-80% da geracao).
  const kwhInjetado = geracaoKwh * percentualGeracaoInjetada;
  const fioBPago = kwhInjetado * tusdFioBRsKwh * percentualFioBVigente;

  // Consumo nao coberto pela geracao (compra da rede ao preco cheio)
  const consumoLiquido = Math.max(0, consumoKwh - geracaoKwh);
  const consumoPago = consumoLiquido * tarifaRsKwh;

  return fioBPago + consumoPago + custoIluminacaoPublica;
}

// ============================================================================
// Fio B + simultaneidade por tipo de sistema (Lei 14.300)
// ============================================================================

export type TipoSistema = 'on_grid' | 'hibrido' | 'off_grid';
export type ModoBateria = 'backup' | 'autoconsumo' | 'time_of_use';
export type PerfilCliente = 'residencial' | 'comercial' | 'rural' | 'industrial';

// Cronograma do Fio B pago sobre a energia injetada/compensada (art. 27, Lei 14.300).
// Quem pediu acesso ate 06/01/2023 e isento ate 2045 (tratado fora daqui).
export function percentualFioBPorAno(ano: number): number {
  if (ano <= 2023) return 0.15;
  if (ano === 2024) return 0.30;
  if (ano === 2025) return 0.45;
  if (ano === 2026) return 0.60;
  if (ano === 2027) return 0.75;
  if (ano === 2028) return 0.90;
  return 1.00; // 2029+ (ANEEL define; usamos 100% como teto conservador)
}

// Fracao da geracao que vai pra REDE (e portanto paga Fio B). O complemento e o
// autoconsumo simultaneo (nao paga Fio B). Quanto MENOR, melhor pro cliente.
// Valores sugeridos por perfil/tipo/modo — sempre EDITAVEIS na proposta.
// Base: residencial consome pouco de dia (injeta muito); comercio/industria
// consomem mais durante a geracao (injetam menos). Bateria em autoconsumo
// guarda o excedente do dia -> injeta pouquissimo. Carregador usado de dia
// vira autoconsumo -> reduz a injecao.
const INJETADO_BASE_POR_PERFIL: Record<PerfilCliente, number> = {
  residencial: 0.75,
  comercial: 0.45,
  rural: 0.55,
  industrial: 0.35,
};

export function percentualInjetadoSugerido(opts: {
  tipoSistema: TipoSistema;
  modoBateria?: ModoBateria;
  perfil?: PerfilCliente;
  temCarregador?: boolean;
}): number {
  if (opts.tipoSistema === 'off_grid') return 0;

  // Hibrido com bateria ciclando (autoconsumo/time-of-use): injeta pouco.
  if (opts.tipoSistema === 'hibrido') {
    if (opts.modoBateria === 'autoconsumo') return 0.15;
    if (opts.modoBateria === 'time_of_use') return 0.20;
    // 'backup' (ou nao informado): bateria reservada, injeta como on-grid -> cai pro base abaixo.
  }

  const base = INJETADO_BASE_POR_PERFIL[opts.perfil ?? 'residencial'];
  // Carregador carregado de dia aumenta o autoconsumo -> tira ~0.15 da injecao (piso 0.10).
  const ajustado = opts.temCarregador ? base - 0.15 : base;
  return Math.max(0.10, Math.round(ajustado * 100) / 100);
}

// Conta mensal pos-solar DETALHADA (breakdown pra ilustracao da proposta).
// Ramifica por tipo de sistema:
// - off_grid: sem rede -> sem Fio B, sem consumo da rede, sem iluminacao -> conta 0.
// - on_grid / hibrido: Fio B (sobre injetado) + consumo nao coberto + iluminacao.
//   (o efeito do modo da bateria entra via percentualGeracaoInjetada, que o
//    chamador define com percentualInjetadoSugerido.)
export interface ContaDetalhada {
  total: number;
  fioB: number;
  consumoRede: number; // R$ do consumo nao coberto pela geracao
  cip: number;         // iluminacao publica
  autoconsumoKwh: number;
  injetadoKwh: number;
}

export function calcularContaMensalDetalhada(p: {
  consumoKwh: number;
  geracaoKwh: number;
  tarifaRsKwh: number;
  tusdFioBRsKwh: number;
  percentualFioBVigente: number;
  percentualGeracaoInjetada: number;
  custoIluminacaoPublica: number;
  tipoSistema: TipoSistema;
}): ContaDetalhada {
  if (p.tipoSistema === 'off_grid') {
    return { total: 0, fioB: 0, consumoRede: 0, cip: 0, autoconsumoKwh: 0, injetadoKwh: 0 };
  }
  const injetadoKwh = p.geracaoKwh * p.percentualGeracaoInjetada;
  const autoconsumoKwh = Math.max(0, p.geracaoKwh - injetadoKwh);
  const fioB = injetadoKwh * p.tusdFioBRsKwh * p.percentualFioBVigente;
  const consumoLiquido = Math.max(0, p.consumoKwh - p.geracaoKwh);
  const consumoRede = consumoLiquido * p.tarifaRsKwh;
  const cip = p.custoIluminacaoPublica;
  return {
    total: fioB + consumoRede + cip,
    fioB,
    consumoRede,
    cip,
    autoconsumoKwh,
    injetadoKwh,
  };
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
    tusdFioBRsKwh,
    percentualFioBVigente,
    percentualGeracaoInjetada,
    custoIluminacaoPublica,
    reajusteAnualEnergia,
    valorTotalRs,
    vidaUtilAnos,
    geracaoMensalKwhOverride,
  } = input;

  // Geracao mes-a-mes do estudo: quando o estudo trouxe os 12 valores, eles viram a
  // curva do grafico e a media vira a geracao mensal dos indicadores.
  const geracaoDistribuidaEstudo = (input.geracaoMensalKwhDistribuidoOverride
    && input.geracaoMensalKwhDistribuidoOverride.length === 12
    && input.geracaoMensalKwhDistribuidoOverride.every(v => isFinite(v) && v >= 0))
    ? input.geracaoMensalKwhDistribuidoOverride
    : null;

  // Geracao: usa (1) media do estudo mes-a-mes, (2) override unico do PVSol, (3) formula.
  const geracaoMensalKwh = geracaoDistribuidaEstudo
    ? geracaoDistribuidaEstudo.reduce((a, b) => a + b, 0) / 12
    : (geracaoMensalKwhOverride && geracaoMensalKwhOverride > 0)
      ? geracaoMensalKwhOverride
      : calcularGeracaoMensal(potenciaKwp, hsp, fatorPerda);
  const geracaoAnualKwh = geracaoMensalKwh * 12;
  const geracaoVidaUtilKwh = geracaoAnualKwh * vidaUtilAnos;

  // Distribuicao mensal: a do estudo (se veio), senao a curva de sazonalidade padrao.
  const geracaoMensalDistribuida = geracaoDistribuidaEstudo
    ?? calcularGeracaoMensalDistribuida(geracaoMensalKwh);
  // Consumo: usa override mes-a-mes se cliente trouxe historico real, senao plano
  const consumoMensalDistribuido = (input.consumoMensalKwhDistribuidoOverride
    && input.consumoMensalKwhDistribuidoOverride.length === 12)
    ? input.consumoMensalKwhDistribuidoOverride
    : Array(12).fill(consumoMensalKwh);

  // Conta mensal sem/com sistema (com Fio B na conta com sistema)
  const contaSemSistemaMensal = consumoMensalKwh * tarifaRsKwh + custoIluminacaoPublica;
  const contaComSistemaMensal = calcularContaMensal(
    consumoMensalKwh,
    geracaoMensalKwh,
    tarifaRsKwh,
    tusdFioBRsKwh,
    percentualFioBVigente,
    percentualGeracaoInjetada,
    custoIluminacaoPublica,
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

// Preco de mercado estimado (R$) pra um sistema de dado kWp, base Greener 2026.
// Usado em ESTIMATIVAS de conversa (payback aproximado) — NUNCA e o preco fechado,
// que o Responsavel Tecnico define vendo padrao de entrada e telhado.
export function precoMercadoEstimado(potenciaKwp: number): number {
  if (potenciaKwp <= 0) return 0;
  const faixa = GREENER_2026.find(f => potenciaKwp >= f.minKwp && potenciaKwp < f.maxKwp)
    ?? GREENER_2026[GREENER_2026.length - 1];
  return Math.round(potenciaKwp * 1000 * faixa.rsPorWp);
}

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
