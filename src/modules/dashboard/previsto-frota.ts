// Previsto × Real da FROTA (Command Center) — ontem, usina por usina.
// Ordena por quem gerou MENOS do que devia (não por quem gerou pouco).
import { situacaoDoDia, diferencaPct, type Clima, type Situacao } from '../monitoring/previsto/situacao.js';

export interface PrevistoLinhaDb { sistema_id: string; kwh_previsto: number | string; clima: string }

export interface LinhaFrotaPrevisto {
  id: string;
  apelido: string;
  previsto: number;
  real: number | null;
  dif: number | null;
  clima: Clima;
  situacao: Situacao;
}

export interface ResumoPrevistoFrota {
  data: string;
  /** Soma do real ÷ soma do previsto nas usinas que mandaram dado (%). */
  frotaPct: number | null;
  usinasComPrevisto: number;
  porSituacao: Record<Situacao, number>;
  /** Piores primeiro: muito abaixo → abaixo → sem comunicação → resto. */
  linhas: LinhaFrotaPrevisto[];
}

const ORDEM: Situacao[] = ['muito_abaixo', 'abaixo', 'sem_comunicacao', 'dia_fraco', 'normal', 'sem_previsto'];

export function resumirPrevistoFrota(
  usinas: readonly { id: string; apelido: string | null }[],
  previstos: readonly PrevistoLinhaDb[],
  reaisDoDia: ReadonlyMap<string, number>,
  data: string,
): ResumoPrevistoFrota | null {
  const nome = new Map(usinas.map((u) => [u.id, u.apelido || 'Usina']));
  const linhas: LinhaFrotaPrevisto[] = [];
  for (const p of previstos) {
    if (!nome.has(p.sistema_id)) continue; // só usinas ativas da empresa
    const previsto = Number(p.kwh_previsto);
    if (!Number.isFinite(previsto)) continue;
    const real = reaisDoDia.has(p.sistema_id) ? (reaisDoDia.get(p.sistema_id) as number) : null;
    const clima = p.clima as Clima;
    linhas.push({
      id: p.sistema_id, apelido: nome.get(p.sistema_id) as string, previsto, real,
      dif: diferencaPct(previsto, real), clima, situacao: situacaoDoDia({ previsto, real, clima }),
    });
  }
  if (!linhas.length) return null;
  linhas.sort((a, b) => ORDEM.indexOf(a.situacao) - ORDEM.indexOf(b.situacao) || (a.dif ?? 0) - (b.dif ?? 0) || a.apelido.localeCompare(b.apelido, 'pt-BR'));
  const porSituacao = Object.fromEntries(ORDEM.map((s) => [s, 0])) as Record<Situacao, number>;
  let p = 0, r = 0;
  for (const l of linhas) {
    porSituacao[l.situacao]++;
    if (l.real !== null && l.previsto > 0.5) { p += l.previsto; r += l.real; }
  }
  return {
    data, linhas, usinasComPrevisto: linhas.length, porSituacao,
    frotaPct: p > 0 ? Math.round((r / p) * 1000) / 10 : null,
  };
}
