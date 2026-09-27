// Junta os dados do relatório de UMA UC e UM mês, com as mesmas travas da tela
// (só gera com o mês 🟢). Dependências injetadas: a rota passa o repo da tela,
// a geração da API e a tarifa da empresa; o teste passa fakes.

import type { LinhaDemonstrativo, GeracaoManual } from './demonstrativos-tela-repo.js';
import { validarMes, type ResultadoValidacao } from './gd-validacao.js';
import { compensadoDoMes, consumoDoMes, historicoPorMes } from './demonstrativos-tela.js';
import { mesExtenso, montarRelatorio, type RelatorioGd } from './relatorio-motor.js';
import {
  erroDoPeriodo, faltaNoPeriodo, mesesDoPeriodo, montarRelatorioPeriodo,
  type MesEntradaPeriodo, type RelatorioPeriodoGd,
} from './relatorio-periodo-motor.js';

export interface DepsServicoRelatorio {
  historicoDaInstalacao: (instalacao: string) => Promise<LinhaDemonstrativo[]>;
  geracoesManuais: (instalacoes: string[], referencia?: string) => Promise<Map<string, GeracaoManual>>;
  sistemaDoLead: (leadId: string) => Promise<{ potenciaKwp: number | null; uf: string | null }>;
  geracaoApiDoMes: (leadId: string, referencia: string) => Promise<number | null>;
  tarifaRsKwh: number;
}

export type ResultadoPreparo =
  | { ok: true; relatorio: RelatorioGd; leadId: string }
  | { ok: false; status: 404 | 409; motivo: string };

type Sistema = { potenciaKwp: number | null; uf: string | null };

/** A MESMA validação 🟢 do mês — usada pelo relatório mensal e, mês a mês, pelo do período. */
async function validarLinha(
  l: LinhaDemonstrativo, instalacao: string, manuais: Map<string, GeracaoManual>, sis: Sistema, d: DepsServicoRelatorio,
): Promise<ResultadoValidacao> {
  const referencia = l.referencia;
  const manualDoMes = manuais.get(`${instalacao}|${referencia}`)?.kwh ?? null;
  const apiDoMes = l.lead_id ? await d.geracaoApiDoMes(l.lead_id, referencia) : null;
  return validarMes({
    leadId: l.lead_id, referencia, injetadoKwh: l.injetado_kwh, inconsistenciasLeitura: l.inconsistencias,
    geracaoManualKwh: manualDoMes, geracaoApiKwh: apiDoMes, potenciaKwp: sis.potenciaKwp, uf: sis.uf,
    // Mesmo compensado que o motor usa (digitado sem histórico cai no crédito utilizado).
    compensadoKwh: compensadoDoMes(l) ?? l.credito_utilizado_kwh, consumoKwh: consumoDoMes(l),
  });
}

export async function prepararRelatorio(instalacao: string, referencia: string, d: DepsServicoRelatorio): Promise<ResultadoPreparo> {
  const hist = await d.historicoDaInstalacao(instalacao);
  const l = hist.find((h) => h.referencia === referencia);
  if (!l) return { ok: false, status: 404, motivo: 'não há demonstrativo desse mês para essa UC' };

  const manuais = await d.geracoesManuais([instalacao]);
  const sis = l.lead_id ? await d.sistemaDoLead(l.lead_id) : { potenciaKwp: null, uf: null };
  const v = await validarLinha(l, instalacao, manuais, sis, d);
  if (v.estado !== 'pronto' || v.geracaoKwh === null || v.origemGeracao === null) {
    const motivo = [...v.bloqueios, ...v.pendencias][0] ?? 'o mês ainda não está pronto';
    return { ok: false, status: 409, motivo };
  }
  // 🟢 já exige cliente ligado; a checagem explícita deixa o tipo sem null.
  if (!l.lead_id) return { ok: false, status: 409, motivo: 'UC sem cliente — ligue a um cliente cadastrado' };

  const geracaoPorMes: Record<string, number | null> = {};
  // Rateio: o histórico tem uma linha por unidade no mês — meses DISTINTOS.
  const mesesGrafico = historicoPorMes(l.historico, 13).map((m) => m.mes);
  for (const mes of mesesGrafico) {
    if (mes === referencia) { geracaoPorMes[mes] = v.geracaoKwh; continue; }
    const manual = manuais.get(`${instalacao}|${mes}`)?.kwh;
    geracaoPorMes[mes] = manual ?? (l.lead_id ? await d.geracaoApiDoMes(l.lead_id, mes) : null);
  }

  return {
    ok: true,
    leadId: l.lead_id,
    relatorio: montarRelatorio({
      linha: l, geracaoKwh: v.geracaoKwh, origemGeracao: v.origemGeracao, geracaoPorMes,
      potenciaKwp: sis.potenciaKwp, esperadoMesKwh: v.esperadoMesKwh, tarifaRsKwh: d.tarifaRsKwh,
    }),
  };
}

export type ResultadoPreparoPeriodo =
  | { ok: true; relatorio: RelatorioPeriodoGd; leadId: string }
  | { ok: false; status: 400 | 409; motivo: string };

/**
 * Relatório do PERÍODO (ex.: maio a agosto): TODO mês do período tem de existir
 * e estar 🟢 — com a mesma validação do mensal, mês a mês. O 1º que falhar
 * volta como "falta em <mês>: …" (pendência) ou "erro em <mês>: …" (número
 * que não bate). Todos os meses têm de ser do mesmo cliente.
 */
export async function prepararRelatorioPeriodo(
  instalacao: string, inicio: string, fim: string, d: DepsServicoRelatorio,
): Promise<ResultadoPreparoPeriodo> {
  const erro = erroDoPeriodo(inicio, fim);
  if (erro) return { ok: false, status: 400, motivo: erro };
  const meses = mesesDoPeriodo(inicio, fim);

  const hist = await d.historicoDaInstalacao(instalacao);
  const linhas: LinhaDemonstrativo[] = [];
  for (const mes of meses) {
    const l = hist.find((h) => h.referencia === mes);
    if (!l) return { ok: false, status: 409, motivo: `falta em ${mesExtenso(mes)}: não há demonstrativo desse mês` };
    linhas.push(l);
  }
  const leadFinal = linhas[linhas.length - 1].lead_id;

  const manuais = await d.geracoesManuais([instalacao]);
  const sistemas = new Map<string, Sistema>();
  const sistemaDe = async (leadId: string | null): Promise<Sistema> => {
    if (!leadId) return { potenciaKwp: null, uf: null };
    if (!sistemas.has(leadId)) sistemas.set(leadId, await d.sistemaDoLead(leadId));
    return sistemas.get(leadId)!;
  };

  const entradas: MesEntradaPeriodo[] = [];
  for (const l of linhas) {
    const v = await validarLinha(l, instalacao, manuais, await sistemaDe(l.lead_id), d);
    if (v.estado !== 'pronto' || v.geracaoKwh === null || v.origemGeracao === null) {
      const tipo = v.bloqueios.length > 0 ? 'erro' : 'falta';
      const motivo = [...v.bloqueios, ...v.pendencias][0] ?? 'o mês ainda não está pronto';
      return { ok: false, status: 409, motivo: `${tipo} em ${mesExtenso(l.referencia)}: ${motivo}` };
    }
    if (l.lead_id !== leadFinal) {
      return { ok: false, status: 409, motivo: `erro em ${mesExtenso(l.referencia)}: esse mês está ligado a outro cliente — confira a UC` };
    }
    entradas.push({ linha: l, geracaoKwh: v.geracaoKwh, origemGeracao: v.origemGeracao, esperadoMesKwh: v.esperadoMesKwh });
  }
  // 🟢 já exige cliente ligado; a checagem deixa o tipo sem null.
  if (!leadFinal) return { ok: false, status: 409, motivo: 'UC sem cliente — ligue a um cliente cadastrado' };

  // Gráfico: 13 meses até o fim; no período, a geração já validada.
  const geracaoPorMes: Record<string, number | null> = {};
  const ultima = linhas[linhas.length - 1];
  for (const { mes } of historicoPorMes(ultima.historico, 13, ultima.unidades.length)) {
    const doPeriodo = entradas.find((x) => x.linha.referencia === mes);
    if (doPeriodo) { geracaoPorMes[mes] = doPeriodo.geracaoKwh; continue; }
    geracaoPorMes[mes] = manuais.get(`${instalacao}|${mes}`)?.kwh ?? await d.geracaoApiDoMes(leadFinal, mes);
  }

  const sis = await sistemaDe(leadFinal);
  const relatorio = montarRelatorioPeriodo({
    inicio, fim, meses: entradas, geracaoPorMes, potenciaKwp: sis.potenciaKwp, tarifaRsKwh: d.tarifaRsKwh,
  });
  const falta = faltaNoPeriodo(relatorio);
  if (falta) return { ok: false, status: 409, motivo: falta };
  return { ok: true, leadId: leadFinal, relatorio };
}
