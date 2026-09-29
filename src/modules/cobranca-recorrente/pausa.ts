// src/modules/cobranca-recorrente/pausa.ts
// "Se não pagar, a assistente para" (28/09/2026) — regras PURAS + cache.
//
// Só a assistente de um TENANT pausa (assinatura com company_id de outra
// empresa que não a casa). A casa (EcoSun/Eva) e cliente avulso NUNCA.
// Pausar = a assistente para de responder os clientes do tenant; as mensagens
// continuam chegando e ficam no painel dele (o mesmo caminho do "equipe
// assumiu": registrarSemResponder). O painel, o login e os dados NÃO são
// bloqueados. Pagou → volta sozinha.
//
// Estado na assinatura (migration 146): assistente_pausada_em (pausada desde),
// pausa_automatica (false = "nunca pausar automaticamente"), dias_pausa
// (padrão 3 → D+3), pausa_adiada_ate ("dar mais prazo").

import { diasEntre, DIAS_PAUSA_MIN, DIAS_PAUSA_MAX, DIAS_PAUSA_PADRAO, type StatusAssinatura, type StatusFatura } from './ciclo.js';

export interface EstadoPausa {
  companyId: string | null;
  status: StatusAssinatura;
  pausaAutomatica: boolean;
  diasPausa: number;
  pausaAdiadaAte: string | null;
  assistentePausadaEm: string | null;
}

export type DecisaoPausa = 'pausar' | 'reativar';

/** Só tenant (empresa que não é a casa) tem assistente que pode pausar. */
export function podePausar(a: { companyId: string | null }, casaId: string): boolean {
  return !!a.companyId && a.companyId !== casaId;
}

export function diasPausaValidos(n: number | null | undefined): number {
  const v = Math.round(Number(n ?? DIAS_PAUSA_PADRAO));
  if (!Number.isFinite(v)) return DIAS_PAUSA_PADRAO;
  return Math.min(DIAS_PAUSA_MAX, Math.max(DIAS_PAUSA_MIN, v));
}

function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** Dia em que a pausa acontece: vencimento + dias; com prazo dado, o dia seguinte ao prazo (nunca antes). */
export function dataDaPausa(venceEm: string, diasPausa: number, adiadaAte: string | null): string {
  const normal = somarDias(venceEm, diasPausaValidos(diasPausa));
  if (!adiadaAte) return normal;
  const depoisDoPrazo = somarDias(adiadaAte, 1);
  return depoisDoPrazo > normal ? depoisDoPrazo : normal;
}

/**
 * O que fazer hoje com a assistente desta assinatura:
 *  - pausada e sem fatura VENCIDA em aberto → 'reativar' (vale até pra casa, por segurança);
 *  - pode pausar, pausa automática ligada, assinatura cobrando (ativa/travada),
 *    fatura em aberto mais antiga chegou no dia da pausa (respeitando o prazo dado) → 'pausar';
 *  - senão nada.
 */
export function decidirPausa(
  a: EstadoPausa,
  faturas: ReadonlyArray<{ status: StatusFatura; venceEm: string }>,
  hoje: string,
  casaId: string,
): DecisaoPausa | null {
  const vencidas = faturas.filter((f) => f.status === 'aberta' && f.venceEm < hoje).sort((x, y) => (x.venceEm < y.venceEm ? -1 : 1));
  if (a.assistentePausadaEm) return vencidas.length === 0 || !podePausar(a, casaId) ? 'reativar' : null;
  if (!podePausar(a, casaId) || !a.pausaAutomatica) return null;
  if (a.status !== 'ativa' && a.status !== 'travada') return null;
  const maisAntiga = vencidas[0];
  if (!maisAntiga) return null;
  return hoje >= dataDaPausa(maisAntiga.venceEm, a.diasPausa, a.pausaAdiadaAte) ? 'pausar' : null;
}

/** Quantos dias faltam pra pausa (pro aviso "será pausada amanhã"). */
export function diasAtePausa(venceEm: string, diasPausa: number, adiadaAte: string | null, hoje: string): number {
  return diasEntre(hoje, dataDaPausa(venceEm, diasPausa, adiadaAte));
}

// ---------------------------------------------------------------------------
// Cache: a pergunta "a assistente desta empresa está pausada?" é feita a cada
// mensagem que chega. 60 s de cache; o processo que pausa/reativa limpa na hora
// (os outros servidores pegam em até 1 min). Erro → NÃO pausa.
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

export async function empresaPausadaNoCache(c: CachePausa, companyId: string | undefined | null, casaId: string, ttlMs = 60_000): Promise<boolean> {
  if (!companyId || companyId === casaId) return false; // a casa nunca
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
