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
  // Simultaneidade: fracao da geracao que vai pra REDE (paga Fio B). OPCIONAL —
  // quando ausente, calcular() sugere por tipoSistema/modoBateria/perfil/carregador
  // (percentualInjetadoSugerido). Quando o Junior edita na proposta, esse valor vence.
  percentualGeracaoInjetada?: number; // residencial sem bateria ~0.75 (75% vai pra rede)
  custoIluminacaoPublica: number; // R$/mes, valor fixo da fatura

  // Tipo de sistema (ramifica o calculo da conta com solar). Default 'on_grid'.
  // - off_grid: sem rede -> sem Fio B/CIP/consumo -> conta com solar = 0, economia = conta inteira.
  // - hibrido: depende do modoBateria (backup injeta como on-grid; autoconsumo injeta pouco).
  tipoSistema?: TipoSistema;
  modoBateria?: ModoBateria; // so usado quando tipoSistema='hibrido'
  perfilCliente?: PerfilCliente; // residencial/comercial/rural/industrial (simultaneidade sugerida)
  temCarregador?: boolean; // carregador EV usado de dia aumenta autoconsumo -> menos injecao/Fio B
  // Ano inicial da projecao (calendario). O % do Fio B SOBE ano a ano a partir
  // dele (Lei 14.300 art. 27: 2026=60% ... 2029+=100%). Default = ano corrente.
  anoInicial?: number;

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

  // Conta com solar do mes 1, DETALHADA (Fio B / consumo da rede / CIP /
  // autoconsumo / injetado). Alimenta o bloco visual "como sua economia funciona".
  contaComDetalhada: ContaDetalhada;
  // Parametros efetivamente usados (pra ilustracao + tabelinhas da proposta).
  tipoSistema: TipoSistema;
  percentualGeracaoInjetadaUsado: number; // simultaneidade aplicada (override ou sugerida)
  anoInicial: number; // ano calendario do inicio da projecao
  percentualFioBInicial: number; // % do Fio B no ano inicial (ex: 2026 = 0.60)
  // Tabelinhas da ilustracao "como sua economia funciona" (vazias em off_grid).
  tabelaSimultaneidade: LinhaSimultaneidade[];
  tabelaFioBAnos: LinhaFioBAno[];

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

// Classifica o tipo de sistema a partir dos dados crus da proposta. off_grid e
// detectado por palavra-chave (tipoCliente/modalidade); hibrido pela presenca de
// bateria ou palavra-chave; senao on_grid (default retrocompativel).
export function tipoSistemaDeDados(d: {
  tipoCliente?: string;
  modalidade?: string;
  temBateria?: boolean;
}): TipoSistema {
  const t = `${d.tipoCliente ?? ''} ${d.modalidade ?? ''}`.toLowerCase();
  if (/off.?grid|isolad/.test(t)) return 'off_grid';
  if (d.temBateria || /h[ií]brido|bateria/.test(t)) return 'hibrido';
  return 'on_grid';
}

// Mapeia o tipoCliente (texto livre do Claude) pro perfil de simultaneidade.
export function perfilDeTipoCliente(tipoCliente?: string): PerfilCliente {
  const t = (tipoCliente ?? '').toLowerCase();
  if (/ind[uú]str/.test(t)) return 'industrial';
  if (/rural|agro|fazenda/.test(t)) return 'rural';
  if (/com[eé]rc/.test(t)) return 'comercial';
  return 'residencial';
}

// Detecta carregador veicular nos servicos avulsos (vira autoconsumo diurno ->
// reduz a injecao/Fio B). Olha titulo + descricao de cada servico.
export function temCarregadorNosServicos(
  servicos?: Array<{ titulo?: string; descricao?: string }>,
): boolean {
  if (!Array.isArray(servicos)) return false;
  return servicos.some(s => /carregad|wallbox|veicular|\bev\b/i.test(`${s.titulo ?? ''} ${s.descricao ?? ''}`));
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

// ============================================================================
// Tabelinhas da ilustracao "como sua economia funciona" (proposta)
// ============================================================================

// Parametros comuns de uma conta com solar (sem a simultaneidade e o % do Fio B,
// que cada tabela varia).
export interface ContaBaseParams {
  consumoKwh: number;
  geracaoKwh: number;
  tarifaRsKwh: number;
  tusdFioBRsKwh: number;
  custoIluminacaoPublica: number;
  tipoSistema: TipoSistema;
}

export interface LinhaSimultaneidade {
  autoconsumoPct: number; // fracao usada na hora (nao paga Fio B)
  injetadoPct: number;    // fracao mandada pra rede (paga Fio B)
  fioB: number;
  total: number;
}

// "Quanto mais usa de dia, menos paga": varia o autoconsumo (10/25/50% padrao) e
// mostra o Fio B caindo. injetado = 1 - autoconsumo. Usa o % do Fio B do ano vigente.
export function tabelaSimultaneidade(
  p: ContaBaseParams & { percentualFioBVigente: number },
  niveisAutoconsumo: number[] = [0.10, 0.25, 0.50],
): LinhaSimultaneidade[] {
  return niveisAutoconsumo.map(autoconsumoPct => {
    const injetadoPct = Math.max(0, 1 - autoconsumoPct);
    const c = calcularContaMensalDetalhada({
      consumoKwh: p.consumoKwh,
      geracaoKwh: p.geracaoKwh,
      tarifaRsKwh: p.tarifaRsKwh,
      tusdFioBRsKwh: p.tusdFioBRsKwh,
      percentualFioBVigente: p.percentualFioBVigente,
      percentualGeracaoInjetada: injetadoPct,
      custoIluminacaoPublica: p.custoIluminacaoPublica,
      tipoSistema: p.tipoSistema,
    });
    return { autoconsumoPct, injetadoPct, fioB: c.fioB, total: c.total };
  });
}

export interface LinhaFioBAno {
  ano: number;
  percentualFioB: number;
  fioB: number;
  total: number;
}

// "O Fio B sobe com os anos": mantem a simultaneidade do cliente e varia so o %
// do Fio B por ano (Lei 14.300). Tarifa/tusd ficam no valor atual (isola o efeito
// da rampa — a projecao completa com reajuste fica no grafico de fluxo de caixa).
export function tabelaFioBPorAno(
  p: ContaBaseParams & { percentualGeracaoInjetada: number },
  anos: number[],
): LinhaFioBAno[] {
  return anos.map(ano => {
    const percentualFioB = percentualFioBPorAno(ano);
    const c = calcularContaMensalDetalhada({
      consumoKwh: p.consumoKwh,
      geracaoKwh: p.geracaoKwh,
      tarifaRsKwh: p.tarifaRsKwh,
      tusdFioBRsKwh: p.tusdFioBRsKwh,
      percentualFioBVigente: percentualFioB,
      percentualGeracaoInjetada: p.percentualGeracaoInjetada,
      custoIluminacaoPublica: p.custoIluminacaoPublica,
      tipoSistema: p.tipoSistema,
    });
    return { ano, percentualFioB, fioB: c.fioB, total: c.total };
  });
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

// Payback a partir do fluxo de caixa anual REAL (fluxoCaixaAnual[0] = -investimento,
// [1..] = economia de cada ano, que já reflete o Fio B subindo). Acumula até cobrir
// o investimento e interpola a fração do ano. Coerente com ROI/TIR (mesmo vetor).
// Anos com economia <= 0 não amortizam (sistema inviável -> retorna maxAnos).
export function paybackDeFluxo(fluxoCaixaAnual: number[], investimento: number, maxAnos: number): number {
  if (investimento <= 0) return 0;
  let acumulado = 0;
  for (let ano = 1; ano < fluxoCaixaAnual.length; ano++) {
    const econAno = fluxoCaixaAnual[ano];
    if (econAno <= 0) continue;
    if (acumulado + econAno >= investimento) {
      return (ano - 1) + (investimento - acumulado) / econAno;
    }
    acumulado += econAno;
  }
  return maxAnos;
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
    custoIluminacaoPublica,
    reajusteAnualEnergia,
    valorTotalRs,
    vidaUtilAnos,
    geracaoMensalKwhOverride,
  } = input;

  const tipoSistema: TipoSistema = input.tipoSistema ?? 'on_grid';
  const anoInicial = input.anoInicial ?? new Date().getFullYear();
  // Simultaneidade: override explicito (Junior editou) vence; senao sugere por
  // perfil/tipo/modo/carregador. off_grid nao injeta nada.
  const percentualGeracaoInjetada = tipoSistema === 'off_grid'
    ? 0
    : (typeof input.percentualGeracaoInjetada === 'number' && isFinite(input.percentualGeracaoInjetada)
      ? input.percentualGeracaoInjetada
      : percentualInjetadoSugerido({
          tipoSistema,
          modoBateria: input.modoBateria,
          perfil: input.perfilCliente,
          temCarregador: input.temCarregador,
        }));

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

  // Conta mensal sem/com sistema. A conta COM sistema sai do breakdown detalhado
  // (ramifica por tipo: off_grid zera tudo) — o template usa esse mesmo objeto.
  const contaSemSistemaMensal = consumoMensalKwh * tarifaRsKwh + custoIluminacaoPublica;
  const contaComDetalhada = calcularContaMensalDetalhada({
    consumoKwh: consumoMensalKwh,
    geracaoKwh: geracaoMensalKwh,
    tarifaRsKwh,
    tusdFioBRsKwh,
    percentualFioBVigente,
    percentualGeracaoInjetada,
    custoIluminacaoPublica,
    tipoSistema,
  });
  const contaComSistemaMensal = contaComDetalhada.total;
  const economiaMensal = contaSemSistemaMensal - contaComSistemaMensal;
  const economiaAnual = economiaMensal * 12;

  // Projecao anual (vida util). DOIS efeitos compostos por ano:
  // (1) reajuste da energia (tarifa + Fio B R$/kWh + CIP sobem juntos);
  // (2) o % do Fio B SOBE ano a ano (Lei 14.300: 2026=60% ... 2029+=100%) — sem
  //     isso a conta futura ficaria subestimada. off_grid mantem conta com = 0.
  const fluxoCaixaAnual: number[] = [-valorTotalRs];
  const contaSemSistemaAnual: number[] = [];
  const contaComSistemaAnual: number[] = [];
  let economiaAcum = 0;
  for (let ano = 1; ano <= vidaUtilAnos; ano++) {
    const reajuste = Math.pow(1 + reajusteAnualEnergia, ano - 1);
    // Ano 1 usa o % do headline (input.percentualFioBVigente — respeita override do
    // Junior) -> a 1ª barra do gráfico SEMPRE bate com a conta com solar do topo.
    // Anos seguintes sobem pelo cronograma da Lei 14.300.
    const fioBpctAno = ano === 1 ? percentualFioBVigente : percentualFioBPorAno(anoInicial + ano - 1);
    const semSistAno = contaSemSistemaMensal * 12 * reajuste;
    const comSistMensalAno = calcularContaMensalDetalhada({
      consumoKwh: consumoMensalKwh,
      geracaoKwh: geracaoMensalKwh,
      tarifaRsKwh: tarifaRsKwh * reajuste,
      tusdFioBRsKwh: tusdFioBRsKwh * reajuste,
      percentualFioBVigente: fioBpctAno,
      percentualGeracaoInjetada,
      custoIluminacaoPublica: custoIluminacaoPublica * reajuste,
      tipoSistema,
    }).total;
    const comSistAno = comSistMensalAno * 12;
    const econAno = semSistAno - comSistAno;
    contaSemSistemaAnual.push(semSistAno);
    contaComSistemaAnual.push(comSistAno);
    fluxoCaixaAnual.push(econAno);
    economiaAcum += econAno;
  }

  // Indicadores
  // Payback sai do MESMO fluxo de caixa anual (que já tem o ramp do Fio B), pra
  // ficar coerente com ROI/TIR/economia-25-anos. Varre o fluxo acumulando a
  // economia real de cada ano (que CAI conforme o Fio B sobe) até cobrir o
  // investimento — em vez de re-projetar a economia do ano 1 (otimista).
  const paybackBruto = paybackDeFluxo(fluxoCaixaAnual, valorTotalRs, vidaUtilAnos);
  // Se nao paga em vidaUtil, marca como inviavel pra template renderizar aviso.
  const paybackInviavel = paybackBruto >= vidaUtilAnos;
  const paybackAnos = paybackInviavel ? vidaUtilAnos : Math.floor(paybackBruto);
  const paybackMeses = paybackInviavel ? 0 : Math.round((paybackBruto % 1) * 12);
  const roiVezes = economiaAcum / valorTotalRs;
  const tirPercentual = calcularTIR(fluxoCaixaAnual) * 100;
  const rsPorWp = valorTotalRs / (potenciaKwp * 1000);

  // Sustentabilidade (matriz brasileira ~0.084 kg CO2/kWh)
  const co2EvitadoToneladas = (geracaoVidaUtilKwh * 0.084) / 1000;

  // Tabelinhas da ilustracao. Off_grid nao tem Fio B -> vazias (template mostra
  // "voce sai da conta de luz"). Anos do Fio B: inicial, seguinte e 2029 (100%).
  const anosFioB = Array.from(new Set([anoInicial, Math.min(anoInicial + 1, 2029), 2029]))
    .filter(a => a >= anoInicial)
    .sort((a, b) => a - b);
  const baseConta: ContaBaseParams = {
    consumoKwh: consumoMensalKwh,
    geracaoKwh: geracaoMensalKwh,
    tarifaRsKwh,
    tusdFioBRsKwh,
    custoIluminacaoPublica,
    tipoSistema,
  };
  const tabelaSim = tipoSistema === 'off_grid'
    ? []
    : tabelaSimultaneidade({ ...baseConta, percentualFioBVigente });
  const tabelaFioB = tipoSistema === 'off_grid'
    ? []
    : tabelaFioBPorAno({ ...baseConta, percentualGeracaoInjetada }, anosFioB);

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
    contaComDetalhada,
    tipoSistema,
    percentualGeracaoInjetadaUsado: percentualGeracaoInjetada,
    anoInicial,
    // Mesmo % usado no R$ do mês 1 (headline) — rótulo e valor nunca contam
    // histórias diferentes, mesmo se o Junior sobrescrever o % do Fio B.
    percentualFioBInicial: percentualFioBVigente,
    tabelaSimultaneidade: tabelaSim,
    tabelaFioBAnos: tabelaFioB,
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
