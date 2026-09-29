// src/modules/cobranca-recorrente/pausa.ts
// "Se não pagar, a assistente para" (28/09/2026) — regras PURAS + caches.
//
// Duas travas, só para TENANT (a casa/EcoSun/Eva e cliente avulso NUNCA):
//  1ª trava (padrão D+3): a assistente para de RESPONDER os clientes do tenant.
//     As mensagens continuam chegando e ficam no painel dele.
//  2ª trava (padrão D+7): param TAMBÉM os disparos automáticos pros clientes do
//     tenant (cadência, follow-ups, reativação, lembretes). Eles ficam na fila
//     e, ao pagar, voltam de onde pararam — reagendados com espaçamento.
// Painel, login e dados NUNCA são bloqueados. Pagou → as duas voltam.
// "Dar mais prazo" empurra as duas (mantendo a distância entre elas).
//
// Estado na assinatura (migration 146): assistente_pausada_em (1ª),
// disparos_pausados_em (2ª), pausa_automatica (false = nunca pausar),
// dias_pausa (1ª, padrão 3), dias_trava_disparos (2ª, padrão 7),
// pausa_adiada_ate ("dar mais prazo").

import { diasEntre, DIAS_PAUSA_MIN, DIAS_PAUSA_MAX, DIAS_PAUSA_PADRAO, type StatusAssinatura, type StatusFatura } from './ciclo.js';

export const DIAS_TRAVA_DISPAROS_PADRAO = 7;

/**
 * Produtos cuja mensalidade SEGURA a assistente virtual. Uma empresa pode ter
 * várias assinaturas (assistente virtual agora, monitoramento depois): só a
 * fatura da assinatura da ASSISTENTE VIRTUAL pausa a assistente — atraso de
 * outro produto (ex.: monitoramento) nunca mexe nela.
 */
export const PRODUTOS_COM_ASSISTENTE: readonly string[] = ['assistente_virtual'];
export const DIAS_TRAVA_DISPAROS_MAX = 60;

export interface EstadoPausa {
  companyId: string | null;
  /** Produto da assinatura — só os de PRODUTOS_COM_ASSISTENTE pausam a assistente. */
  produtoId?: string;
  status: StatusAssinatura;
  pausaAutomatica: boolean;
  diasPausa: number;
  /** 2ª trava: dias depois do vencimento (sempre depois da 1ª). */
  diasTravaDisparos: number;
  pausaAdiadaAte: string | null;
  assistentePausadaEm: string | null;
  disparosPausadosEm: string | null;
}

export type DecisaoPausa = 'pausar' | 'pausar_disparos' | 'reativar';

/** Só tenant (empresa que não é a casa), e só a assinatura da Assistente virtual. */
export function podePausar(a: { companyId: string | null; produtoId?: string }, casaId: string): boolean {
  if (a.produtoId !== undefined && !PRODUTOS_COM_ASSISTENTE.includes(a.produtoId)) return false;
  return !!a.companyId && a.companyId !== casaId;
}

export function diasPausaValidos(n: number | null | undefined): number {
  const v = Math.round(Number(n ?? DIAS_PAUSA_PADRAO));
  if (!Number.isFinite(v)) return DIAS_PAUSA_PADRAO;
  return Math.min(DIAS_PAUSA_MAX, Math.max(DIAS_PAUSA_MIN, v));
}

/** 2ª trava sempre pelo menos 1 dia depois da 1ª. */
export function diasTravaDisparosValidos(n: number | null | undefined, diasPausa: number): number {
  const p = diasPausaValidos(diasPausa);
  const v = Math.round(Number(n ?? DIAS_TRAVA_DISPAROS_PADRAO));
  const base = Number.isFinite(v) ? v : DIAS_TRAVA_DISPAROS_PADRAO;
  return Math.min(DIAS_TRAVA_DISPAROS_MAX, Math.max(p + 1, base));
}

function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** Dia da 1ª trava: vencimento + dias; com prazo dado, o dia seguinte ao prazo (nunca antes). */
export function dataDaPausa(venceEm: string, diasPausa: number, adiadaAte: string | null): string {
  const normal = somarDias(venceEm, diasPausaValidos(diasPausa));
  if (!adiadaAte) return normal;
  const depoisDoPrazo = somarDias(adiadaAte, 1);
  return depoisDoPrazo > normal ? depoisDoPrazo : normal;
}

/** Dia da 2ª trava: mesma distância da 1ª (o prazo empurra as duas). */
export function dataDaTravaDisparos(venceEm: string, diasPausa: number, diasTrava: number, adiadaAte: string | null): string {
  const p = diasPausaValidos(diasPausa);
  const t = diasTravaDisparosValidos(diasTrava, p);
  return somarDias(dataDaPausa(venceEm, p, adiadaAte), t - p);
}

/**
 * O que fazer hoje (uma coisa por rodada):
 *  - alguma trava ligada e sem fatura VENCIDA em aberto → 'reativar' (desfaz as duas; vale até pra casa, por segurança);
 *  - tenant, pausa automática ligada, cobrando (ativa/suspensa), fatura vencida mais antiga:
 *      chegou o dia da 1ª trava e ela está desligada → 'pausar';
 *      1ª ligada, chegou o dia da 2ª e ela está desligada → 'pausar_disparos'.
 */
export function decidirPausa(
  a: EstadoPausa,
  faturas: ReadonlyArray<{ status: StatusFatura; venceEm: string }>,
  hoje: string,
  casaId: string,
): DecisaoPausa | null {
  const vencidas = faturas.filter((f) => f.status === 'aberta' && f.venceEm < hoje).sort((x, y) => (x.venceEm < y.venceEm ? -1 : 1));
  const algumaTrava = !!a.assistentePausadaEm || !!a.disparosPausadosEm;
  if (algumaTrava && (vencidas.length === 0 || !podePausar(a, casaId))) return 'reativar';
  if (!podePausar(a, casaId) || !a.pausaAutomatica) return null;
  if (a.status !== 'ativa' && a.status !== 'travada') return null;
  const maisAntiga = vencidas[0];
  if (!maisAntiga) return null;
  if (!a.assistentePausadaEm) {
    return hoje >= dataDaPausa(maisAntiga.venceEm, a.diasPausa, a.pausaAdiadaAte) ? 'pausar' : null;
  }
  if (!a.disparosPausadosEm && hoje >= dataDaTravaDisparos(maisAntiga.venceEm, a.diasPausa, a.diasTravaDisparos, a.pausaAdiadaAte)) {
    return 'pausar_disparos';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reagendar os disparos na volta — "de onde parou", sem enxurrada
// ---------------------------------------------------------------------------

/**
 * Cada disparo pendente anda o tempo que ficou parado (mantém a distância
 * entre os toques de cada cliente). O que ainda cair no passado vai pra
 * `agora + inicioMin`, e NENHUM sai colado no anterior: mínimo `gapMin`
 * minutos entre dois disparos da mesma empresa.
 */
export function novosHorarios(
  itens: ReadonlyArray<{ id: string; quando: string }>,
  pausadoDesde: string,
  agora: string,
  o: { inicioMin?: number; gapMin?: number } = {},
): Array<{ id: string; quando: string }> {
  const MIN = 60_000;
  const t0 = Date.parse(agora) + (o.inicioMin ?? 30) * MIN;
  const gap = (o.gapMin ?? 5) * MIN;
  const delta = Math.max(0, Date.parse(agora) - Date.parse(pausadoDesde));
  const deslocados = itens.map((i) => {
    const old = Date.parse(i.quando);
    const novo = old >= Date.parse(pausadoDesde) ? old + delta : t0;
    return { id: i.id, t: Math.max(novo, t0) };
  }).sort((x, y) => x.t - y.t);
  let anterior = -Infinity;
  return deslocados.map((d) => {
    const t = Math.max(d.t, anterior + gap);
    anterior = t;
    return { id: d.id, quando: new Date(t).toISOString() };
  });
}

// ---------------------------------------------------------------------------
// Caches (a pergunta é feita a cada mensagem / a cada lote de disparos)
// ---------------------------------------------------------------------------

export interface CachePausa {
  consultar: (companyId: string) => Promise<boolean>;
  agora: () => number;
  mapa: Map<string, { em: number; pausada: boolean }>;
  limpar: (companyId?: string) => void;
}

export function criarCachePausa(consultar: (companyId: string) => Promise<boolean>, agora: () => number = Date.now): CachePausa {
  const mapa = new Map<string, { em: number; pausada: boolean }>();
  return { consultar, agora, mapa, limpar: (cid) => (cid ? mapa.delete(cid) : mapa.clear(), undefined) };
}

/** 1ª trava: a assistente desta empresa está pausada? A casa nunca. Erro → não pausa. */
export async function empresaPausadaNoCache(c: CachePausa, companyId: string | undefined | null, casaId: string, ttlMs = 60_000): Promise<boolean> {
  if (!companyId || companyId === casaId) return false;
  const hit = c.mapa.get(companyId);
  if (hit && c.agora() - hit.em < ttlMs) return hit.pausada;
  try {
    const pausada = await c.consultar(companyId);
    c.mapa.set(companyId, { em: c.agora(), pausada });
    return pausada;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 2ª trava — PONTO ÚNICO de checagem pra TODO disparo automático aos clientes
// de um tenant (cadência, follow-ups, reativação, lembretes). Configurado 1x no
// boot (index.ts); cada robô chama `disparoLiberado` / `filtrarDisparosLiberados`.
// Sem configuração ou erro → libera (comportamento de antes). A casa nunca trava.
// ---------------------------------------------------------------------------

const CASA_PADRAO = '00000000-0000-0000-0000-000000000001';
let consultarTravados: (() => Promise<ReadonlySet<string>>) | null = null;
let cacheTravados: { em: number; set: ReadonlySet<string> } | null = null;
let relogio: () => number = Date.now;

export function configurarTravaDisparos(consultar: (() => Promise<ReadonlySet<string>>) | null, agora: () => number = Date.now): void {
  consultarTravados = consultar;
  cacheTravados = null;
  relogio = agora;
}

export function limparCacheDisparos(): void {
  cacheTravados = null;
}

async function empresasTravadas(ttlMs = 60_000): Promise<ReadonlySet<string>> {
  if (!consultarTravados) return new Set();
  if (cacheTravados && relogio() - cacheTravados.em < ttlMs) return cacheTravados.set;
  try {
    const set = await consultarTravados();
    cacheTravados = { em: relogio(), set };
    return set;
  } catch {
    return cacheTravados?.set ?? new Set();
  }
}

/** Pode disparar automaticamente pra cliente desta empresa? */
export async function disparoLiberado(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId || companyId === CASA_PADRAO) return true;
  return !(await empresasTravadas()).has(companyId);
}

/** Tira do lote o que é de empresa travada (fica PENDENTE na fila — volta ao pagar). */
export async function filtrarDisparosLiberados<T>(itens: T[], empresaDe: (i: T) => string | null | undefined, rotulo = 'disparo'): Promise<T[]> {
  if (itens.length === 0) return itens;
  const travadas = await empresasTravadas();
  if (travadas.size === 0) return itens;
  const livres = itens.filter((i) => { const c = empresaDe(i); return !c || c === CASA_PADRAO || !travadas.has(c); });
  if (livres.length < itens.length) {
    console.log(`[cobranca-recorrente] ${itens.length - livres.length} ${rotulo}(s) segurado(s) — empresa com disparos pausados por fatura`);
  }
  return livres;
}

/** Quantos dias faltam pra 1ª trava. */
export function diasAtePausa(venceEm: string, diasPausa: number, adiadaAte: string | null, hoje: string): number {
  return diasEntre(hoje, dataDaPausa(venceEm, diasPausa, adiadaAte));
}
