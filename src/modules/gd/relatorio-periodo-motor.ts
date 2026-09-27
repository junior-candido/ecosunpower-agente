// Motor PURO do RELATÓRIO DO PERÍODO da usina (ex.: "maio a agosto de 2026").
// O dono manda a cada 4–5 meses, principalmente pra cliente com RATEIO (uma UC
// geradora dividindo créditos com várias unidades). Recebe os meses do período
// (cada um já validado 🟢 por quem chama) e soma. Regra de ouro: número que
// falta NUNCA vira 0 — o total fica nulo e `faltaNoPeriodo` diz qual mês.
// Mesmas regras do relatório mensal (relatorio-motor.ts): consumo e compensado
// somando as unidades do rateio, nunca `total_compensado_kwh` (acumulado).

import type { LinhaDemonstrativo } from './demonstrativos-tela-repo.js';
import { mesCurto } from './demonstrativo-cruzamento.js';
import { compensadoDoMes, consumoDoMes, historicoPorMes, numOuNull, tipoAvisoVencimento } from './demonstrativos-tela.js';
import { mesExtenso } from './relatorio-motor.js';

export const MAX_MESES_PERIODO = 12;

export interface MesEntradaPeriodo {
  /** Linha do mês (já validada 🟢 por quem chama). */
  linha: LinhaDemonstrativo;
  geracaoKwh: number;
  origemGeracao: 'manual' | 'api';
  esperadoMesKwh: number | null;
}

export interface EntradaRelatorioPeriodo {
  inicio: string; // YYYY-MM-01
  fim: string; // YYYY-MM-01
  /** Um por mês do período, em ordem. */
  meses: MesEntradaPeriodo[];
  /** Geração por mês (YYYY-MM-01) pro gráfico de 13 meses; sem dado = null/ausente. */
  geracaoPorMes: Record<string, number | null>;
  potenciaKwp: number | null;
  tarifaRsKwh: number;
}

export interface MesDoPeriodo {
  mes: string;
  rotulo: string;
  mesExtenso: string;
  gerouKwh: number;
  consumoKwh: number | null;
  compensadoKwh: number | null;
  economiaRs: number | null;
  injetadoKwh: number | null;
  esperadoKwh: number | null;
}

export interface MesGraficoPeriodo {
  mes: string;
  rotulo: string;
  geracao: number | null;
  consumo: number | null;
  injetado: number | null;
  compensado: number | null;
  /** true = mês do período (destacado no gráfico). */
  noPeriodo: boolean;
}

export interface UnidadePeriodo {
  codigoCliente: string;
  percentual: number | null;
  consumoKwh: number | null;
  compensadoKwh: number | null;
  /** Saldo de hoje (do último mês do período). */
  saldoKwh: number | null;
}

export interface RelatorioPeriodoGd {
  cliente: string;
  instalacao: string;
  inicio: string;
  fim: string;
  periodoExtenso: string;
  meses: MesDoPeriodo[];
  totais: {
    gerouKwh: number;
    consumoKwh: number | null;
    compensadoKwh: number | null;
    economiaRs: number | null;
    injetadoKwh: number | null;
  };
  creditosHojeKwh: number | null;
  creditos: {
    saldoKwh: number | null;
    usadosNoPeriodoKwh: number | null;
    aVencerKwh: number | null;
    venceEm: string | null;
    avisoVencimento: 'alerta' | 'validade' | null;
  };
  rateio: UnidadePeriodo[];
  desempenho: { esperadoKwh: number | null; percentual: number | null; potenciaKwp: number | null };
  frase: string;
  grafico: MesGraficoPeriodo[];
  fontes: string[];
  tarifaRsKwh: number;
}

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

const ORIGEM_DEMONSTRATIVO: Record<string, string> = {
  email: 'e-mail da concessionária',
  pdf_manual: 'PDF enviado pela equipe',
  digitado: 'digitado pela equipe a partir do demonstrativo',
};

function somarMes(iso: string, n: number): string {
  const [a, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function quantosMeses(inicio: string, fim: string): number {
  const [a1, m1] = inicio.split('-').map(Number);
  const [a2, m2] = fim.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

/** Motivo do período ser inválido (formato, início depois do fim, mais de 12 meses) ou null se está certo. */
export function erroDoPeriodo(inicio: string, fim: string): string | null {
  if (!RE_MES.test(String(inicio ?? '')) || !RE_MES.test(String(fim ?? ''))) return 'período inválido (use meses AAAA-MM-01)';
  const n = quantosMeses(inicio, fim);
  if (n < 1) return 'o mês de início está depois do mês final';
  if (n > MAX_MESES_PERIODO) return `o período pode ter no máximo ${MAX_MESES_PERIODO} meses`;
  return null;
}

/** Os meses do período, em ordem (YYYY-MM-01). Período inválido → lança. */
export function mesesDoPeriodo(inicio: string, fim: string): string[] {
  const erro = erroDoPeriodo(inicio, fim);
  if (erro) throw new Error(`relatório do período: ${erro}`);
  return Array.from({ length: quantosMeses(inicio, fim) }, (_, i) => somarMes(inicio, i));
}

/** "maio a agosto de 2026" · "novembro de 2025 a fevereiro de 2026" · um mês só = "agosto de 2026". */
export function periodoExtenso(inicio: string, fim: string): string {
  if (inicio === fim) return mesExtenso(fim);
  const [a1] = inicio.split('-');
  const [a2] = fim.split('-');
  const ini = mesExtenso(inicio);
  return a1 === a2 ? `${ini.replace(/ de \d{4}$/, '')} a ${mesExtenso(fim)}` : `${ini} a ${mesExtenso(fim)}`;
}

/** Soma em que QUALQUER valor nulo deixa o total nulo (nunca soma 0 no lugar do que falta). */
function somaEstrita(valores: Array<number | null>): number | null {
  let soma = 0;
  for (const v of valores) {
    if (v === null) return null;
    soma += v;
  }
  return r2(soma);
}

/** Compensado do mês com a MESMA regra do mensal: histórico somando unidades; digitado cai nos créditos usados. */
function compensadoComoMensal(l: LinhaDemonstrativo): { kwh: number | null; digitado: boolean } {
  const c = compensadoDoMes(l);
  if (c !== null) return { kwh: c, digitado: false };
  const usado = numOuNull(l.credito_utilizado_kwh);
  return { kwh: usado, digitado: usado !== null };
}

/** Linhas do histórico do mês por unidade (codigoCliente), sem a repetição de reenvio. */
function unidadesDoMes(l: LinhaDemonstrativo): Map<string, { consumida: number | null; compensado: number | null }> {
  const out = new Map<string, { consumida: number | null; compensado: number | null }>();
  for (const h of l.historico) {
    if (h.mes !== l.referencia || !h.codigoCliente || out.has(h.codigoCliente)) continue;
    out.set(h.codigoCliente, { consumida: numOuNull(h.consumida), compensado: numOuNull(h.compensado) });
  }
  return out;
}

export function montarRelatorioPeriodo(e: EntradaRelatorioPeriodo): RelatorioPeriodoGd {
  const esperados = mesesDoPeriodo(e.inicio, e.fim);
  const recebidos = e.meses.map((m) => m.linha.referencia);
  if (recebidos.join(',') !== esperados.join(',')) {
    throw new Error(`relatório do período: os meses recebidos (${recebidos.join(', ')}) não batem com o período (${esperados.join(', ')})`);
  }
  for (const m of e.meses) {
    if (typeof m.geracaoKwh !== 'number' || !Number.isFinite(m.geracaoKwh) || m.geracaoKwh < 0) {
      throw new Error(`relatório do período: geração inválida em ${m.linha.referencia} (${m.geracaoKwh})`);
    }
  }

  let usouDigitado = false;
  const meses: MesDoPeriodo[] = e.meses.map((m) => {
    const l = m.linha;
    const comp = compensadoComoMensal(l);
    if (comp.digitado) usouDigitado = true;
    return {
      mes: l.referencia,
      rotulo: mesCurto(l.referencia),
      mesExtenso: mesExtenso(l.referencia),
      gerouKwh: m.geracaoKwh,
      consumoKwh: consumoDoMes(l),
      compensadoKwh: comp.kwh,
      economiaRs: comp.kwh === null ? null : r2(comp.kwh * e.tarifaRsKwh),
      injetadoKwh: numOuNull(l.injetado_kwh),
      esperadoKwh: m.esperadoMesKwh,
    };
  });

  const totais = {
    gerouKwh: r2(meses.reduce((s, m) => s + m.gerouKwh, 0)),
    consumoKwh: somaEstrita(meses.map((m) => m.consumoKwh)),
    compensadoKwh: somaEstrita(meses.map((m) => m.compensadoKwh)),
    economiaRs: somaEstrita(meses.map((m) => m.economiaRs)),
    injetadoKwh: somaEstrita(meses.map((m) => m.injetadoKwh)),
  };

  const ultima = e.meses[e.meses.length - 1].linha;
  const texto = periodoExtenso(e.inicio, e.fim);

  // Rateio: unidades do último mês (ordem do demonstrativo) + qualquer outra que apareça no histórico do período.
  const porMes = e.meses.map((m) => unidadesDoMes(m.linha));
  const codigos: string[] = ultima.unidades.map((u) => u.codigoCliente);
  for (const mapa of porMes) for (const c of mapa.keys()) if (!codigos.includes(c)) codigos.push(c);
  const rateio: UnidadePeriodo[] = codigos.length > 1
    ? codigos.map((codigo) => {
        const u = ultima.unidades.find((x) => x.codigoCliente === codigo);
        // Unidade sem linha num mês do período: não dá pra afirmar a soma → nulo.
        const doMes = porMes.map((mapa) => mapa.get(codigo) ?? null);
        return {
          codigoCliente: codigo,
          percentual: u ? numOuNull(u.percentual) : null,
          consumoKwh: somaEstrita(doMes.map((x) => x?.consumida ?? null)),
          compensadoKwh: somaEstrita(doMes.map((x) => x?.compensado ?? null)),
          saldoKwh: u ? numOuNull(u.saldo) : null,
        };
      })
    : [];

  const esperadoKwh = somaEstrita(meses.map((m) => m.esperadoKwh));
  const percentual = esperadoKwh !== null && esperadoKwh > 0 ? Math.round((totais.gerouKwh / esperadoKwh) * 100) : null;

  let frase = `De ${texto} sua usina gerou ${fmt(totais.gerouKwh)} kWh.`;
  if (totais.compensadoKwh !== null && totais.compensadoKwh > 0) {
    frase += ` Nesse período, ${fmt(totais.compensadoKwh)} kWh de créditos abateram as contas`;
    frase += totais.economiaRs !== null ? `, uma economia estimada de ${brl(totais.economiaRs)}.` : '.';
  }

  const noPeriodo = new Set(esperados);
  const grafico: MesGraficoPeriodo[] = historicoPorMes(ultima.historico, 13, ultima.unidades.length).map((h) => ({
    mes: h.mes,
    rotulo: mesCurto(h.mes),
    geracao: numOuNull(e.geracaoPorMes[h.mes]),
    consumo: h.consumida,
    injetado: h.injetada,
    compensado: h.compensado,
    noPeriodo: noPeriodo.has(h.mes),
  }));

  const origens = [...new Set(e.meses.map((m) => ORIGEM_DEMONSTRATIVO[m.linha.origem] ?? m.linha.origem))];
  const todosVerificados = e.meses.every((m) => m.linha.origem_verificada);
  const origensGeracao = new Set(e.meses.map((m) => m.origemGeracao));
  const fontes = [
    `Consumo, injetado e créditos: demonstrativos da concessionária de cada mês (${origens.join('; ')}${todosVerificados ? ', assinatura conferida' : ''}).`,
    origensGeracao.size > 1
      ? 'Geração: monitoramento da usina (soma dos dias do mês) e, em alguns meses, informada e conferida pela equipe.'
      : origensGeracao.has('api')
        ? 'Geração: monitoramento da usina (soma dos dias de cada mês).'
        : 'Geração: informada e conferida pela equipe.',
    `Economia estimada = créditos compensados × R$ ${e.tarifaRsKwh.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/kWh (tarifa média; a Lei 14.300 cobra parte do Fio B, por isso é estimada).`,
    'Totais do período = soma dos meses. Créditos guardados = saldo do último mês.',
  ];
  if (rateio.length > 1) fontes.push(`Consumo e créditos: soma das ${rateio.length} unidades do rateio.`);
  if (usouDigitado) fontes.push('Em mês sem histórico no demonstrativo, a economia usa os créditos usados no mês informados no demonstrativo.');
  if (esperadoKwh !== null) fontes.push('Esperado = potência da usina × média de sol da região × dias de cada mês.');

  return {
    cliente: ultima.cliente_nome,
    instalacao: ultima.instalacao,
    inicio: e.inicio,
    fim: e.fim,
    periodoExtenso: texto,
    meses,
    totais,
    creditosHojeKwh: numOuNull(ultima.saldo_acumulado_kwh),
    creditos: {
      saldoKwh: numOuNull(ultima.saldo_acumulado_kwh),
      usadosNoPeriodoKwh: totais.compensadoKwh,
      aVencerKwh: numOuNull(ultima.proximo_expirar_kwh),
      venceEm: ultima.ciclo_expirar ? mesCurto(ultima.ciclo_expirar) : null,
      avisoVencimento: tipoAvisoVencimento(numOuNull(ultima.proximo_expirar_kwh), ultima.ciclo_expirar, e.fim),
    },
    rateio,
    desempenho: { esperadoKwh, percentual, potenciaKwp: e.potenciaKwp },
    frase,
    grafico,
    fontes,
    tarifaRsKwh: e.tarifaRsKwh,
  };
}

/**
 * O que falta pro relatório do período poder sair (o 1º mês sem consumo ou
 * sem créditos compensados), ou null se está tudo. Total nulo NUNCA sai no
 * PDF como se fosse zero.
 */
export function faltaNoPeriodo(r: RelatorioPeriodoGd): string | null {
  const semConsumo = r.meses.find((m) => m.consumoKwh === null);
  if (semConsumo) return `falta o consumo de ${semConsumo.mesExtenso}`;
  const semComp = r.meses.find((m) => m.compensadoKwh === null);
  if (semComp) return `faltam os créditos compensados de ${semComp.mesExtenso}`;
  return null;
}

/** Os números que saíram no PDF do período — gravados em relatorios_gd_gerados.numeros (referencia = fim). */
export function numerosDoRelatorioPeriodo(r: RelatorioPeriodoGd): Record<string, unknown> {
  return {
    periodo: { inicio: r.inicio, fim: r.fim },
    gerouKwh: r.totais.gerouKwh, consumoKwh: r.totais.consumoKwh, compensadoKwh: r.totais.compensadoKwh,
    economiaRs: r.totais.economiaRs, injetadoKwh: r.totais.injetadoKwh, creditosKwh: r.creditosHojeKwh,
    tarifaRsKwh: r.tarifaRsKwh, unidades: r.rateio.length,
    meses: r.meses.map((m) => ({ mes: m.mes, gerouKwh: m.gerouKwh, consumoKwh: m.consumoKwh, compensadoKwh: m.compensadoKwh })),
  };
}
