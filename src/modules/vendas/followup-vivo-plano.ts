// Funções PURAS do follow-up vivo (spec 2026-08-21 §6). Sem IO, sem Date.now() — tempo sempre injetado.

export type Argumento =
  | 'resumo' | 'duvida_ab' | 'reenvio_audio' | 'economia' | 'financiamento'
  | 'prova_social' | 'validade' | 'toque_leve' | 'pos_visita';

export interface EtapaDef { etapa: string; offsetMs: number; argumento: Argumento }

const DIA = 86_400_000;
const HORA = 3_600_000;

/** Etapas relativas ao ENVIO da proposta. A2H (abriu e não respondeu) e D0 são disparadas por evento, não pelo plano. */
export const ETAPAS_FIXAS: EtapaDef[] = [
  { etapa: 'NA24', offsetMs: 24 * HORA, argumento: 'reenvio_audio' },
  { etapa: 'D3',   offsetMs: 3 * DIA,   argumento: 'economia' },
  { etapa: 'D5',   offsetMs: 5 * DIA,   argumento: 'financiamento' },
  { etapa: 'D8',   offsetMs: 8 * DIA,   argumento: 'prova_social' },
  { etapa: 'D12',  offsetMs: 12 * DIA,  argumento: 'validade' },
  { etapa: 'D20',  offsetMs: 20 * DIA,  argumento: 'toque_leve' },
  { etapa: 'D35',  offsetMs: 35 * DIA,  argumento: 'toque_leve' },
  { etapa: 'D60',  offsetMs: 60 * DIA,  argumento: 'toque_leve' },
  { etapa: 'D90',  offsetMs: 90 * DIA,  argumento: 'toque_leve' },
  { etapa: 'M1',   offsetMs: 120 * DIA, argumento: 'toque_leve' },
];
export const INTERVALO_MENSAL_MS = 30 * DIA;
export const ARGUMENTO_POR_ETAPA: Record<string, Argumento> = Object.fromEntries(
  ETAPAS_FIXAS.map(e => [e.etapa, e.argumento]),
);
export function argumentoDaEtapa(etapa: string): Argumento {
  if (etapa === 'A2H') return 'duvida_ab';
  if (etapa === 'D0') return 'resumo';
  if (etapa === 'POS_VISITA') return 'pos_visita';
  if (/^M\d+$/.test(etapa)) return 'toque_leve';
  return ARGUMENTO_POR_ETAPA[etapa] ?? 'toque_leve';
}

export function proximaEtapaMensal(etapaAtual: string): string {
  const m = /^M(\d+)$/.exec(etapaAtual);
  if (m) return `M${Number(m[1]) + 1}`;
  return 'M1';
}

// ---- horário comercial: 8h–20h BRT (UTC-3), nunca domingo ----
const BRT_OFFSET_MS = -3 * HORA;
function brtParts(ms: number) {
  const d = new Date(ms + BRT_OFFSET_MS);
  return { hora: d.getUTCHours(), diaSemana: d.getUTCDay(), inicioDiaMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - BRT_OFFSET_MS };
}
export function dentroDoHorario(ms: number): boolean {
  const { hora, diaSemana } = brtParts(ms);
  return diaSemana !== 0 && hora >= 8 && hora < 20;
}
/** Menor instante >= ms que esteja dentro do horário. */
export function proximoHorarioValido(ms: number): number {
  let t = ms;
  for (let i = 0; i < 10; i++) {
    const { hora, diaSemana, inicioDiaMs } = brtParts(t);
    if (diaSemana === 0) { t = inicioDiaMs + DIA + 8 * HORA; continue; }
    if (hora < 8) { t = inicioDiaMs + 8 * HORA; continue; }
    if (hora >= 20) { t = inicioDiaMs + DIA + 8 * HORA; continue; }
    return t;
  }
  return t;
}

export interface EtapaPlanejada { etapa: string; scheduledForMs: number; argumento: Argumento }
export function planejarEtapas(enviadaEmMs: number): EtapaPlanejada[] {
  return ETAPAS_FIXAS.map(e => ({
    etapa: e.etapa,
    scheduledForMs: proximoHorarioValido(enviadaEmMs + e.offsetMs),
    argumento: e.argumento,
  }));
}

// ---- elegibilidade (spec §2 regras 3–5) ----
export interface LeadFlags { eva_active?: boolean | null; opt_out?: boolean | null; status?: string | null; contact_type?: string | null }
const STATUS_BLOQUEADOS: Record<string, string> = {
  descartado: 'status_descartado', perdido: 'status_perdido', inativo: 'status_inativo',
  transferido: 'status_transferido', ganho: 'status_ganho',
};
export type Elegibilidade = { ok: true } | { ok: false; motivo: string };
export function elegivelParaFollowup(lead: LeadFlags, emTakeover: boolean): Elegibilidade {
  if (lead.eva_active === false) return { ok: false, motivo: 'eva_off' };
  if (lead.opt_out === true) return { ok: false, motivo: 'opt_out' };
  if (lead.contact_type === 'inviavel') return { ok: false, motivo: 'inviavel' };
  const st = lead.status ? STATUS_BLOQUEADOS[lead.status] : undefined;
  if (st) return { ok: false, motivo: st };
  if (emTakeover) return { ok: false, motivo: 'takeover' };
  return { ok: true };
}
