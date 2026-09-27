// Motor PURO do relatório mensal da usina (fatia 2 dos demonstrativos).
// Recebe o demonstrativo do mês (o que a concessionária mediu) + a geração
// (monitoramento ou informada e conferida) e devolve tudo o que o PDF mostra.
// Sem banco, sem HTML: o mesmo motor serve a tela, o PDF e, depois, o
// programa Windows do Thiago. Ver
// docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.

import type { LinhaDemonstrativo } from './demonstrativos-tela-repo.js';
import { mesCurto } from './demonstrativo-cruzamento.js';
import { compensadoDoMes, historicoDoMes, historicoPorMes, numOuNull } from './demonstrativos-tela.js';

export interface EntradaRelatorio {
  /** Linha do mês do relatório (já validada 🟢 por quem chama). */
  linha: LinhaDemonstrativo;
  geracaoKwh: number;
  origemGeracao: 'manual' | 'api';
  /** Geração por mês (YYYY-MM-01) pro gráfico; mês sem dado = null/ausente. */
  geracaoPorMes: Record<string, number | null>;
  potenciaKwp: number | null;
  esperadoMesKwh: number | null;
  tarifaRsKwh: number;
}

export interface MesGrafico {
  mes: string;
  rotulo: string;
  geracao: number | null;
  consumo: number | null;
  injetado: number | null;
  compensado: number | null;
}

export interface RelatorioGd {
  cliente: string;
  instalacao: string;
  referencia: string;
  mesExtenso: string;
  gerouKwh: number;
  consumiuKwh: number | null;
  economiaRs: number | null;
  creditosKwh: number | null;
  autoconsumoKwh: number | null;
  injetadoKwh: number | null;
  compensadoKwh: number | null;
  frase: string;
  meses: MesGrafico[];
  creditos: { saldoKwh: number | null; usadosNoMesKwh: number | null; aVencerKwh: number | null; venceEm: string | null };
  rateio: Array<{ codigoCliente: string; percentual: number; saldoKwh: number }>;
  desempenho: { esperadoKwh: number | null; percentual: number | null; potenciaKwp: number | null };
  fontes: string[];
  tarifaRsKwh: number;
}

const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function mesExtenso(iso: string): string {
  const [a, m] = iso.split('-').map(Number);
  return `${MESES_LONGOS[m - 1]} de ${a}`;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const r2 = (v: number) => Math.round(v * 100) / 100;
const RE_REFERENCIA = /^\d{4}-\d{2}-01$/;

const ORIGEM_DEMONSTRATIVO: Record<string, string> = {
  email: 'e-mail da concessionária',
  pdf_manual: 'PDF enviado pela equipe',
  digitado: 'digitado pela equipe a partir do demonstrativo',
};

export function montarRelatorio(e: EntradaRelatorio): RelatorioGd {
  const l = e.linha;
  if (!RE_REFERENCIA.test(String(l.referencia ?? ''))) {
    throw new Error(`relatório GD: referência inválida "${l.referencia}" (esperado AAAA-MM-01)`);
  }
  if (typeof e.geracaoKwh !== 'number' || !Number.isFinite(e.geracaoKwh) || e.geracaoKwh < 0) {
    throw new Error(`relatório GD: geração inválida (${e.geracaoKwh})`);
  }

  // Com rateio, o histórico tem uma linha por unidade no mês: soma todas.
  const doMes = historicoDoMes(l);
  const somandoUnidades = doMes !== null && doMes.unidades > 1;
  let compensadoKwh = compensadoDoMes(l);
  // Demonstrativo digitado não tem histórico: usa os créditos usados no mês.
  const usouCreditosDigitados = compensadoKwh === null && l.credito_utilizado_kwh !== null;
  if (usouCreditosDigitados) compensadoKwh = numOuNull(l.credito_utilizado_kwh);
  const consumiuKwh = somandoUnidades && doMes!.consumida !== null ? doMes!.consumida : l.consumo_kwh;

  const injetadoKwh = l.injetado_kwh;
  // Injetado maior que a geração = número incoerente; melhor não afirmar nada.
  const autoconsumoKwh = injetadoKwh === null || injetadoKwh > e.geracaoKwh ? null : r2(e.geracaoKwh - injetadoKwh);
  const economiaRs = compensadoKwh === null ? null : r2(compensadoKwh * e.tarifaRsKwh);
  const mesTxt = mesExtenso(l.referencia);

  let frase = `Em ${mesTxt} sua usina gerou ${fmt(e.geracaoKwh)} kWh.`;
  if (injetadoKwh !== null && autoconsumoKwh !== null) {
    frase += ` Você usou ${fmt(autoconsumoKwh)} kWh direto do sol e mandou ${fmt(injetadoKwh)} kWh pra rede, que viraram créditos.`;
  }
  if (compensadoKwh !== null && compensadoKwh > 0) {
    frase += ` Neste mês, ${fmt(compensadoKwh)} kWh de créditos abateram a sua conta.`;
  }

  const meses: MesGrafico[] = historicoPorMes(l.historico, 13).map((h) => ({
    mes: h.mes,
    rotulo: mesCurto(h.mes),
    geracao: numOuNull(e.geracaoPorMes[h.mes]),
    consumo: h.consumida,
    injetado: h.injetada,
    compensado: h.compensado,
  }));

  const rateio = l.unidades.length > 1
    ? l.unidades.map((u) => ({ codigoCliente: u.codigoCliente, percentual: u.percentual, saldoKwh: u.saldo }))
    : [];

  const percentual = e.esperadoMesKwh && e.esperadoMesKwh > 0
    ? Math.round((e.geracaoKwh / e.esperadoMesKwh) * 100) : null;

  const fontes = [
    `Consumo, injetado e créditos: demonstrativo da concessionária (${ORIGEM_DEMONSTRATIVO[l.origem] ?? l.origem}${l.origem_verificada ? ', assinatura conferida' : ''}).`,
    e.origemGeracao === 'api'
      ? 'Geração: monitoramento da usina (soma dos dias do mês).'
      : 'Geração: informada e conferida pela equipe.',
    `Economia estimada = ${usouCreditosDigitados ? 'créditos usados no mês' : 'créditos compensados'} × R$ ${e.tarifaRsKwh.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/kWh (tarifa média; a Lei 14.300 cobra parte do Fio B, por isso é estimada).`,
  ];
  if (somandoUnidades) fontes.push(`Consumo e créditos: soma das ${doMes!.unidades} unidades do rateio.`);
  if (usouCreditosDigitados) {
    fontes.push(l.origem === 'digitado'
      ? 'Economia calculada com os créditos usados no mês, digitados a partir do demonstrativo.'
      : 'Economia calculada com os créditos usados no mês informados no demonstrativo.');
  }
  if (e.esperadoMesKwh !== null) fontes.push('Esperado = potência da usina × média de sol da região × dias do mês.');

  return {
    cliente: l.cliente_nome,
    instalacao: l.instalacao,
    referencia: l.referencia,
    mesExtenso: mesTxt,
    gerouKwh: e.geracaoKwh,
    consumiuKwh,
    economiaRs,
    creditosKwh: l.saldo_acumulado_kwh,
    autoconsumoKwh,
    injetadoKwh,
    compensadoKwh,
    frase,
    meses,
    creditos: {
      saldoKwh: l.saldo_acumulado_kwh,
      usadosNoMesKwh: l.credito_utilizado_kwh,
      aVencerKwh: l.proximo_expirar_kwh,
      venceEm: l.ciclo_expirar ? mesCurto(l.ciclo_expirar) : null,
    },
    rateio,
    desempenho: { esperadoKwh: e.esperadoMesKwh, percentual, potenciaKwp: e.potenciaKwp },
    fontes,
    tarifaRsKwh: e.tarifaRsKwh,
  };
}
