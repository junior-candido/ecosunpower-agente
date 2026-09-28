// src/modules/energia/agregacao.ts
//
// O coração da Gestão de Energia (spec §2.4). Funções PURAS:
//   agregar15min — leituras de 1 min (ou fotos de 15 min da nuvem) → janelas de 15 min
//   resumirDia   — janelas de um dia de Brasília → resumo diário
//
// Regras de honestidade (regra do Junior: nunca número inventado):
//   - energia sai da DIFERENÇA DOS CONTADORES acumulados do aparelho, repartida
//     pelo tempo quando o intervalo atravessa a fronteira da janela;
//   - contador que "anda pra trás" (aparelho reiniciado) ou ausente → integra a
//     potência, e SÓ em intervalo curto (≤ 10 min);
//   - intervalo maior que o limite = BURACO: não conta energia nem cobertura.
//     A janela fica com segundos_cobertos < 900 (ou nem existe) — nunca zero.

import { faixaProdist, LIMITE_DESARME_INVERSOR_V, type TensaoNominal } from './prodist.js';
import { diaBrt, minutoDoDiaBrt, postoTarifario, type HorarioPonta, PONTA_PADRAO } from './tempo.js';

export interface LeituraBruta {
  medidoEm: string;
  potenciaW: number;
  tensao: number | null;
  fatorPotencia: number | null;
  energiaWh: number | null;          // contador acumulado importado
  energiaDevolvidaWh: number | null; // contador acumulado injetado
}

export interface Janela15 {
  inicio: string;
  importadoWh: number;
  exportadoWh: number;
  potenciaMaxW: number | null;
  tensaoMinV: number | null;
  tensaoMaxV: number | null;
  tensaoMedV: number | null;
  fpMedio: number | null;
  minTensaoPrecaria: number;
  minTensaoCritica: number;
  minAcima242: number;
  segundosCobertos: number; // 0..900 — quanto da janela tem energia medida
}

export interface OpcoesAgregacao {
  tensaoNominal: TensaoNominal | null;
  /** Maior intervalo aceito entre dois contadores. push: 600 s; nuvem: 1800 s. */
  gapMaxContadorS?: number;
  /** Maior intervalo em que se integra a potência (sem contador confiável). */
  gapMaxIntegracaoS?: number;
}

export const JANELA_MS = 15 * 60_000;
export const inicioJanela = (t: number): number => Math.floor(t / JANELA_MS) * JANELA_MS;

export function agregar15min(leituras: LeituraBruta[], o: OpcoesAgregacao): Janela15[] {
  const gapCont = (o.gapMaxContadorS ?? 600) * 1000;
  const gapInt = (o.gapMaxIntegracaoS ?? 600) * 1000;

  // Ordena e tira duplicadas do mesmo instante (o aparelho reenvia na dúvida).
  const vistos = new Set<number>();
  const ls = leituras
    .filter((l) => Number.isFinite(Date.parse(l.medidoEm)) && Number.isFinite(l.potenciaW))
    .sort((a, b) => Date.parse(a.medidoEm) - Date.parse(b.medidoEm))
    .filter((l) => { const t = Date.parse(l.medidoEm); if (vistos.has(t)) return false; vistos.add(t); return true; });

  type Acc = Janela15 & { _vSoma: number; _vN: number; _fpSoma: number; _fpN: number; _ms: number };
  const mapa = new Map<number, Acc>();
  const acc = (ini: number): Acc => {
    let a = mapa.get(ini);
    if (!a) {
      a = {
        inicio: new Date(ini).toISOString(), importadoWh: 0, exportadoWh: 0, potenciaMaxW: null,
        tensaoMinV: null, tensaoMaxV: null, tensaoMedV: null, fpMedio: null,
        minTensaoPrecaria: 0, minTensaoCritica: 0, minAcima242: 0, segundosCobertos: 0,
        _vSoma: 0, _vN: 0, _fpSoma: 0, _fpN: 0, _ms: 0,
      };
      mapa.set(ini, a);
    }
    return a;
  };

  // 1) Grandezas instantâneas: na janela da própria leitura.
  for (const l of ls) {
    const a = acc(inicioJanela(Date.parse(l.medidoEm)));
    a.potenciaMaxW = a.potenciaMaxW === null ? l.potenciaW : Math.max(a.potenciaMaxW, l.potenciaW);
    if (l.tensao != null && Number.isFinite(l.tensao)) {
      a.tensaoMinV = a.tensaoMinV === null ? l.tensao : Math.min(a.tensaoMinV, l.tensao);
      a.tensaoMaxV = a.tensaoMaxV === null ? l.tensao : Math.max(a.tensaoMaxV, l.tensao);
      a._vSoma += l.tensao; a._vN++;
      const f = faixaProdist(l.tensao, o.tensaoNominal);
      if (f === 'precaria') a.minTensaoPrecaria++;
      if (f === 'critica') a.minTensaoCritica++;
      if (l.tensao > LIMITE_DESARME_INVERSOR_V) a.minAcima242++;
    }
    if (l.fatorPotencia != null && Number.isFinite(l.fatorPotencia)) { a._fpSoma += Math.abs(l.fatorPotencia); a._fpN++; }
  }

  // 2) Energia: entre leituras consecutivas, repartida pelo tempo.
  for (let i = 1; i < ls.length; i++) {
    const a = ls[i - 1], b = ls[i];
    const ta = Date.parse(a.medidoEm), tb = Date.parse(b.medidoEm), dt = tb - ta;
    if (dt <= 0) continue;
    let imp: number | null = null, exp: number | null = null;
    const contOk = a.energiaWh != null && b.energiaWh != null && b.energiaWh >= a.energiaWh
      && a.energiaDevolvidaWh != null && b.energiaDevolvidaWh != null && b.energiaDevolvidaWh >= a.energiaDevolvidaWh;
    if (contOk && dt <= gapCont) {
      imp = b.energiaWh! - a.energiaWh!;
      exp = b.energiaDevolvidaWh! - a.energiaDevolvidaWh!;
    } else if (dt <= gapInt) {
      const pm = (a.potenciaW + b.potenciaW) / 2, h = dt / 3_600_000;
      imp = Math.max(pm, 0) * h;
      exp = Math.max(-pm, 0) * h;
    }
    if (imp === null || exp === null) continue; // buraco: não inventa
    for (let t = ta; t < tb;) {
      const ini = inicioJanela(t), fim = Math.min(ini + JANELA_MS, tb), frac = (fim - t) / dt;
      const j = acc(ini);
      j.importadoWh += imp * frac;
      j.exportadoWh += exp * frac;
      j._ms += fim - t;
      t = fim;
    }
  }

  return [...mapa.values()]
    .sort((x, y) => x.inicio.localeCompare(y.inicio))
    .map(({ _vSoma, _vN, _fpSoma, _fpN, _ms, ...j }) => ({
      ...j,
      segundosCobertos: Math.min(900, Math.round(_ms / 1000)),
      tensaoMedV: _vN ? _vSoma / _vN : null,
      fpMedio: _fpN ? _fpSoma / _fpN : null,
    }));
}

export interface ResumoDia {
  dia: string;
  importadoKwh: number;
  exportadoKwh: number;
  impPontaKwh: number;
  impIntermediarioKwh: number;
  impForaPontaKwh: number;
  demandaMaxW: number | null;
  demandaMaxInicio: string | null;
  baseNoturnaW: number | null;
  tensaoMinV: number | null;
  tensaoMaxV: number | null;
  minPrecaria: number;
  minCritica: number;
  coberturaPct: number;
}

/** Janela quase cheia (≥ 14 min) vale para demanda. */
const COBERTURA_DEMANDA_S = 840;
/** Janela da madrugada com ≥ 10 min vale para a base noturna. */
const COBERTURA_BASE_S = 600;

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Resumo de um dia de Brasília. Só usa janelas cujo início cai nesse dia.
 * Demanda = maior potência líquida média de janela quase cheia (imp − exp).
 * Base noturna = mediana da potência líquida das janelas 00:00–04:45.
 * Sem nenhuma janela coberta → null (o dia sem dado não existe).
 */
export function resumirDia(dia: string, janelas: Janela15[], ponta: HorarioPonta = PONTA_PADRAO): ResumoDia | null {
  const js = janelas.filter((j) => j.segundosCobertos > 0 && diaBrt(j.inicio) === dia);
  if (js.length === 0) return null;

  let imp = 0, exp = 0, pPonta = 0, pInter = 0, pFora = 0, seg = 0, prec = 0, crit = 0;
  let demanda: number | null = null, demandaInicio: string | null = null;
  let vMin: number | null = null, vMax: number | null = null;
  const madrugada: number[] = [];

  for (const j of js) {
    imp += j.importadoWh; exp += j.exportadoWh; seg += j.segundosCobertos;
    prec += j.minTensaoPrecaria; crit += j.minTensaoCritica;
    const posto = postoTarifario(j.inicio, ponta);
    if (posto === 'ponta') pPonta += j.importadoWh;
    else if (posto === 'intermediario') pInter += j.importadoWh;
    else pFora += j.importadoWh;

    const liquidaW = (j.importadoWh - j.exportadoWh) / (j.segundosCobertos / 3600);
    if (j.segundosCobertos >= COBERTURA_DEMANDA_S && liquidaW > 0 && (demanda === null || liquidaW > demanda)) {
      demanda = liquidaW; demandaInicio = j.inicio;
    }
    if (j.segundosCobertos >= COBERTURA_BASE_S && minutoDoDiaBrt(j.inicio) < 5 * 60) madrugada.push(liquidaW);
    if (j.tensaoMinV != null) vMin = vMin === null ? j.tensaoMinV : Math.min(vMin, j.tensaoMinV);
    if (j.tensaoMaxV != null) vMax = vMax === null ? j.tensaoMaxV : Math.max(vMax, j.tensaoMaxV);
  }

  return {
    dia,
    importadoKwh: imp / 1000,
    exportadoKwh: exp / 1000,
    impPontaKwh: pPonta / 1000,
    impIntermediarioKwh: pInter / 1000,
    impForaPontaKwh: pFora / 1000,
    demandaMaxW: demanda,
    demandaMaxInicio: demandaInicio,
    baseNoturnaW: mediana(madrugada),
    tensaoMinV: vMin,
    tensaoMaxV: vMax,
    minPrecaria: prec,
    minCritica: crit,
    coberturaPct: Math.min(100, (seg / 86_400) * 100),
  };
}
