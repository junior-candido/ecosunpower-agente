// Rede / qualidade de energia (Energy Studio, Marco 2 — 02/10/2026).
// Tensão por fase no dia × faixas PRODIST (Módulo 8) × limite de desarme do
// inversor (242 V). Cruza com a curva de geração para achar DESARMES PROVÁVEIS:
// tensão alta e, logo em seguida, a geração despenca — a prova de que "a culpa
// foi da rede". Indicativo: inversor/Shelly não são analisador classe A.
import { faixaProdist, LIMITE_DESARME_INVERSOR_V, nominalPelaMediana, type TensaoNominal } from '../../energia/prodist.js';

export interface LeituraTensao { ts: string; fase: string; v: number }
export interface PontoGeracao { ts: string; kw: number }

export interface ResumoFase {
  fase: string;
  min: number;
  max: number;
  leituras: number;
  minutos: { adequada: number; precaria: number; critica: number };
  minutosAcimaDesarme: number;
}

export interface DesarmeProvavel { ts: string; v: number; kwAntes: number; kwDepois: number }

export interface AnaliseRede {
  nominal: TensaoNominal | null;
  fases: ResumoFase[];
  desarmes: DesarmeProvavel[];
  /** Resumo em uma frase (vai na tela e no relatório). */
  veredito: string;
  nivel: 'ok' | 'atencao' | 'critico' | 'sem_dado';
}

const INTERVALO_MAX_MIN = 20; // leitura vale até a próxima (no máx. 20 min)
const ATENCAO_V = 240;        // perto do desarme

export function analisarRede(leituras: LeituraTensao[], geracao: PontoGeracao[] = [], nominalCadastro?: TensaoNominal | null): AnaliseRede {
  const validas = leituras.filter((l) => Number.isFinite(l.v) && l.v > 50 && Number.isFinite(Date.parse(l.ts)));
  if (!validas.length) return { nominal: nominalCadastro ?? null, fases: [], desarmes: [], veredito: 'Sem leitura de tensão neste dia.', nivel: 'sem_dado' };
  const nominal = nominalCadastro ?? nominalPelaMediana(validas.map((l) => l.v));

  const porFase = new Map<string, LeituraTensao[]>();
  for (const l of validas) porFase.set(l.fase, [...(porFase.get(l.fase) ?? []), l]);
  const fases: ResumoFase[] = [];
  for (const [fase, ls] of [...porFase].sort((a, b) => a[0].localeCompare(b[0]))) {
    ls.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const r: ResumoFase = { fase, min: Infinity, max: -Infinity, leituras: ls.length, minutos: { adequada: 0, precaria: 0, critica: 0 }, minutosAcimaDesarme: 0 };
    for (let i = 0; i < ls.length; i++) {
      const v = ls[i].v;
      r.min = Math.min(r.min, v); r.max = Math.max(r.max, v);
      const prox = ls[i + 1] ? (Date.parse(ls[i + 1].ts) - Date.parse(ls[i].ts)) / 60000 : 5;
      const dur = Math.min(Math.max(prox, 0), INTERVALO_MAX_MIN);
      const f = faixaProdist(v, nominal);
      if (f) r.minutos[f] += dur;
      if (v >= LIMITE_DESARME_INVERSOR_V) r.minutosAcimaDesarme += dur;
    }
    r.minutos = { adequada: Math.round(r.minutos.adequada), precaria: Math.round(r.minutos.precaria), critica: Math.round(r.minutos.critica) };
    r.minutosAcimaDesarme = Math.round(r.minutosAcimaDesarme);
    fases.push(r);
  }

  // Desarme provável: leitura ≥ 240 V e, em até 20 min, a geração cai > 70%
  // vinda de um patamar razoável (não é fim de tarde nem nuvem leve).
  const ger = geracao.filter((g) => Number.isFinite(g.kw) && Number.isFinite(Date.parse(g.ts)))
    .map((g) => ({ t: Date.parse(g.ts), kw: g.kw })).sort((a, b) => a.t - b.t);
  const picoGer = Math.max(0, ...ger.map((g) => g.kw));
  const desarmes: DesarmeProvavel[] = [];
  for (const l of validas.filter((x) => x.v >= ATENCAO_V)) {
    const t = Date.parse(l.ts);
    const antes = [...ger].reverse().find((g) => g.t <= t && t - g.t <= INTERVALO_MAX_MIN * 60000);
    const depois = ger.find((g) => g.t > t && g.t - t <= INTERVALO_MAX_MIN * 60000);
    if (!antes || !depois) continue;
    if (antes.kw >= 0.3 * picoGer && depois.kw <= 0.3 * antes.kw) {
      if (!desarmes.some((d) => Math.abs(Date.parse(d.ts) - t) < 30 * 60000)) {
        desarmes.push({ ts: l.ts, v: l.v, kwAntes: antes.kw, kwDepois: depois.kw });
      }
    }
  }

  const maxV = Math.max(...fases.map((f) => f.max));
  const minCrit = fases.reduce((s, f) => s + f.minutos.critica, 0);
  const minPrec = fases.reduce((s, f) => s + f.minutos.precaria, 0);
  const acima = fases.reduce((s, f) => s + f.minutosAcimaDesarme, 0);
  let nivel: AnaliseRede['nivel'] = 'ok';
  let veredito = `Tensão dentro da faixa adequada da ANEEL o dia todo (máx. ${maxV.toFixed(0)} V).`;
  if (desarmes.length) {
    nivel = 'critico';
    veredito = `A tensão da rede chegou a ${maxV.toFixed(0)} V e a usina parou ${desarmes.length}× logo em seguida — desligamento provocado pela REDE, não pelo sistema.`;
  } else if (acima > 0 || minCrit > 0) {
    nivel = 'critico';
    veredito = `Tensão fora da faixa da ANEEL por ${minCrit} min${acima ? ` (${acima} min acima de ${LIMITE_DESARME_INVERSOR_V} V, limite de desarme do inversor)` : ''}. Máx. ${maxV.toFixed(0)} V.`;
  } else if (minPrec > 0 || maxV >= ATENCAO_V) {
    nivel = 'atencao';
    veredito = `Tensão encostando no limite: ${minPrec} min na faixa precária, máx. ${maxV.toFixed(0)} V.`;
  }
  return { nominal, fases, desarmes, veredito, nivel };
}
