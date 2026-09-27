// Junta os dados do relatório de UMA UC e UM mês, com as mesmas travas da tela
// (só gera com o mês 🟢). Dependências injetadas: a rota passa o repo da tela,
// a geração da API e a tarifa da empresa; o teste passa fakes.

import type { LinhaDemonstrativo, GeracaoManual } from './demonstrativos-tela-repo.js';
import { validarMes } from './gd-validacao.js';
import { historicoPorMes } from './demonstrativos-tela.js';
import { montarRelatorio, type RelatorioGd } from './relatorio-motor.js';

export interface DepsServicoRelatorio {
  historicoDaInstalacao: (instalacao: string) => Promise<LinhaDemonstrativo[]>;
  geracoesManuais: (instalacoes: string[], referencia?: string) => Promise<Map<string, GeracaoManual>>;
  sistemaDoLead: (leadId: string) => Promise<{ potenciaKwp: number | null; uf: string | null }>;
  geracaoApiDoMes: (leadId: string, referencia: string) => Promise<number | null>;
  tarifaRsKwh: number;
}

export type ResultadoPreparo =
  | { ok: true; relatorio: RelatorioGd }
  | { ok: false; status: 404 | 409; motivo: string };

export async function prepararRelatorio(instalacao: string, referencia: string, d: DepsServicoRelatorio): Promise<ResultadoPreparo> {
  const hist = await d.historicoDaInstalacao(instalacao);
  const l = hist.find((h) => h.referencia === referencia);
  if (!l) return { ok: false, status: 404, motivo: 'não há demonstrativo desse mês para essa UC' };

  const manuais = await d.geracoesManuais([instalacao]);
  const manualDoMes = manuais.get(`${instalacao}|${referencia}`)?.kwh ?? null;
  const sis = l.lead_id ? await d.sistemaDoLead(l.lead_id) : { potenciaKwp: null, uf: null };
  const apiDoMes = l.lead_id ? await d.geracaoApiDoMes(l.lead_id, referencia) : null;
  const v = validarMes({
    leadId: l.lead_id, referencia, injetadoKwh: l.injetado_kwh, inconsistenciasLeitura: l.inconsistencias,
    geracaoManualKwh: manualDoMes, geracaoApiKwh: apiDoMes, potenciaKwp: sis.potenciaKwp, uf: sis.uf,
  });
  if (v.estado !== 'pronto' || v.geracaoKwh === null || v.origemGeracao === null) {
    const motivo = [...v.bloqueios, ...v.pendencias][0] ?? 'o mês ainda não está pronto';
    return { ok: false, status: 409, motivo };
  }

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
    relatorio: montarRelatorio({
      linha: l, geracaoKwh: v.geracaoKwh, origemGeracao: v.origemGeracao, geracaoPorMes,
      potenciaKwp: sis.potenciaKwp, esperadoMesKwh: v.esperadoMesKwh, tarifaRsKwh: d.tarifaRsKwh,
    }),
  };
}
