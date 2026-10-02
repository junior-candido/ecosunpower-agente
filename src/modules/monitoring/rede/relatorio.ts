// Relatório "a culpa foi da rede" (Energy Studio, Marco 2 — 02/10/2026).
// Junta N dias de tensão + geração e resume por dia com a mesma análise da aba
// Rede. Serve de prova para o cliente, para a garantia e para pedir à
// distribuidora a verificação do nível de tensão.
import { analisarRede, type AnaliseRede, type LeituraTensao, type PontoGeracao } from './analise.js';
import type { TensaoNominal } from '../../energia/prodist.js';

export interface DiaRelatorioRede { dia: string; analise: AnaliseRede }

export interface ResumoRelatorioRede {
  dias: DiaRelatorioRede[];           // só dias COM leitura
  diasSemLeitura: string[];
  nominal: TensaoNominal | null;
  diasCriticos: number;               // algum minuto fora da faixa / ≥ 242 V
  diasAcimaDesarme: number;
  desarmes: number;
  minutosCriticos: number;
  maxima: { v: number; dia: string } | null;
  piorDia: string | null;             // mais desarmes, depois mais minutos críticos
  conclusao: string;
}

/** Dia (YYYY-MM-DD) de Brasília de um instante ISO. */
export const diaBrasilia = (ts: string): string => new Date(Date.parse(ts) - 3 * 3600_000).toISOString().slice(0, 10);

export function montarRelatorioRede(
  leituras: LeituraTensao[],
  geracao: PontoGeracao[],
  dias: string[],
  nominal?: TensaoNominal | null,
): ResumoRelatorioRede {
  const porDiaL = new Map<string, LeituraTensao[]>();
  for (const l of leituras) { const d = diaBrasilia(l.ts); porDiaL.set(d, [...(porDiaL.get(d) ?? []), l]); }
  const porDiaG = new Map<string, PontoGeracao[]>();
  for (const g of geracao) { const d = diaBrasilia(g.ts); porDiaG.set(d, [...(porDiaG.get(d) ?? []), g]); }

  const out: DiaRelatorioRede[] = [];
  const sem: string[] = [];
  for (const dia of dias) {
    const ls = porDiaL.get(dia) ?? [];
    if (!ls.length) { sem.push(dia); continue; }
    out.push({ dia, analise: analisarRede(ls, porDiaG.get(dia) ?? [], nominal ?? null) });
  }
  const nom = nominal ?? out.find((d) => d.analise.nominal)?.analise.nominal ?? null;
  let maxima: ResumoRelatorioRede['maxima'] = null;
  let diasCriticos = 0, diasAcimaDesarme = 0, desarmes = 0, minutosCriticos = 0;
  let pior: { dia: string; score: number } | null = null;
  for (const d of out) {
    const crit = d.analise.fases.reduce((s, f) => s + f.minutos.critica, 0);
    const acima = d.analise.fases.reduce((s, f) => s + f.minutosAcimaDesarme, 0);
    const maxV = Math.max(...d.analise.fases.map((f) => f.max));
    if (!maxima || maxV > maxima.v) maxima = { v: maxV, dia: d.dia };
    if (crit > 0 || acima > 0) diasCriticos++;
    if (acima > 0) diasAcimaDesarme++;
    desarmes += d.analise.desarmes.length;
    minutosCriticos += crit;
    const score = d.analise.desarmes.length * 10000 + crit;
    if (score > 0 && (!pior || score > pior.score)) pior = { dia: d.dia, score };
  }
  const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  let conclusao: string;
  if (!out.length) conclusao = 'Sem leituras de tensão no período.';
  else if (desarmes > 0) conclusao = `Em ${out.length} dias medidos, a tensão da rede passou do limite e a usina desligou ${desarmes} vez(es) logo em seguida, em ${diasAcimaDesarme} dia(s). Os desligamentos são proteção do inversor contra tensão alta da REDE — não defeito do sistema fotovoltaico. Recomenda-se pedir à distribuidora a verificação do nível de tensão no ponto de conexão.`;
  else if (diasCriticos > 0) conclusao = `Em ${out.length} dias medidos, houve ${diasCriticos} dia(s) com tensão fora da faixa adequada da ANEEL (total de ${minutosCriticos} min na faixa crítica; máxima de ${maxima?.v.toFixed(0)} V em ${maxima ? br(maxima.dia) : '—'}). Recomenda-se pedir à distribuidora a verificação do nível de tensão.`;
  else conclusao = `Em ${out.length} dias medidos, a tensão ficou dentro das faixas da ANEEL. A rede não explica perdas de geração neste período.`;
  return { dias: out, diasSemLeitura: sem, nominal: nom, diasCriticos, diasAcimaDesarme, desarmes, minutosCriticos, maxima, piorDia: pior?.dia ?? null, conclusao };
}
