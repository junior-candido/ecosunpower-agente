// src/modules/dashboard/central-atencao.ts
// Motor ÚNICO da Central de Atenção (spec 2026-09-27-command-center-design.md §7).
//
// PURO: recebe os avisos já montados pelos adaptadores (central-atencao-fontes.ts)
// e decide a ORDEM. A Home do Command Center mostra só o topo; /atencao mostra
// tudo. As "ações recomendadas" do resumo da Eva saem daqui também — a mesma
// lista, sem IA: o que tem mais impacto primeiro.

export type Severidade = 'critico' | 'atencao' | 'acompanhar' | 'oportunidade' | 'info';
export type AreaEvento = 'usinas' | 'comercial' | 'marketing' | 'instalacoes' | 'om' | 'financeiro' | 'clientes';

export interface EventoAtencao {
  /** Estável: `${fonte}:${chave}` — tira duplicado. */
  id: string;
  severidade: Severidade;
  area: AreaEvento;
  /** Frase curta em português simples. */
  titulo: string;
  /** "Usinas · monitoramento" */
  contexto: string;
  /** Uma linha a mais de explicação (ex.: o motivo que o Monitoramento deu). */
  detalhe?: string;
  /** Perda/ganho em R$ (ordena dentro da severidade). null = sem número honesto. */
  impactoRs?: number | null;
  /** Linha do impacto, já com a palavra "estimada" quando for estimativa. */
  impactoTexto?: string;
  acao: { rotulo: string; href: string };
  /** ISO — no empate, o mais antigo sobe. */
  desde?: string | null;
}

export const ORDEM_SEVERIDADE: readonly Severidade[] = ['critico', 'atencao', 'acompanhar', 'oportunidade', 'info'];
export const AREAS_EVENTO: readonly AreaEvento[] = ['usinas', 'comercial', 'marketing', 'instalacoes', 'om', 'financeiro', 'clientes'];

const PESO: Record<Severidade, number> = { critico: 0, atencao: 1, acompanhar: 2, oportunidade: 3, info: 4 };

export function ehSeveridade(v: unknown): v is Severidade {
  return typeof v === 'string' && (ORDEM_SEVERIDADE as readonly string[]).includes(v);
}

export function ehAreaEvento(v: unknown): v is AreaEvento {
  return typeof v === 'string' && (AREAS_EVENTO as readonly string[]).includes(v);
}

function temImpacto(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function quando(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** Severidade → impacto R$ (maior primeiro; sem impacto depois) → mais antigo primeiro. Tira duplicado pelo id (fica o mais grave). */
export function priorizar(eventos: readonly EventoAtencao[]): EventoAtencao[] {
  const porId = new Map<string, EventoAtencao>();
  for (const e of eventos) {
    const ja = porId.get(e.id);
    if (!ja || PESO[e.severidade] < PESO[ja.severidade]) porId.set(e.id, e);
  }
  return [...porId.values()].sort((a, b) => {
    const s = PESO[a.severidade] - PESO[b.severidade];
    if (s) return s;
    const ia = temImpacto(a.impactoRs);
    const ib = temImpacto(b.impactoRs);
    if (ia && ib && a.impactoRs !== b.impactoRs) return (b.impactoRs as number) - (a.impactoRs as number);
    if (ia !== ib) return ia ? -1 : 1;
    const da = quando(a.desde);
    const db = quando(b.desde);
    if (da === db) return 0;
    return da < db ? -1 : 1;
  });
}

export function contarPorSeveridade(eventos: readonly EventoAtencao[]): Record<Severidade, number> {
  const c: Record<Severidade, number> = { critico: 0, atencao: 0, acompanhar: 0, oportunidade: 0, info: 0 };
  for (const e of eventos) c[e.severidade] += 1;
  return c;
}

export function topoDaHome(eventos: readonly EventoAtencao[], n = 8): EventoAtencao[] {
  return priorizar(eventos).slice(0, n);
}

/** As N ações de maior impacto. "Info" é só pra saber — nunca vira ação. */
export function acoesRecomendadas(eventos: readonly EventoAtencao[], n = 3): EventoAtencao[] {
  return priorizar(eventos).filter((e) => e.severidade !== 'info').slice(0, n);
}

/** Filtro da tela /atencao. Valor desconhecido (vindo da URL) é ignorado. */
export function filtrarEventos(eventos: readonly EventoAtencao[], f: { area?: unknown; severidade?: unknown }): EventoAtencao[] {
  const area = ehAreaEvento(f.area) ? f.area : null;
  const sev = ehSeveridade(f.severidade) ? f.severidade : null;
  return eventos.filter((e) => (!area || e.area === area) && (!sev || e.severidade === sev));
}
