// Visitas/meets persistidas (migration 102) + toque pós-visita 24 h (spec 2026-08-21 §6).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FollowupVivoService } from './followup-vivo.js';
import { podeDispararMensagens } from '../dashboard/permissions.js';

const POS_VISITA_MS = 24 * 3_600_000;

export interface VisitaRow { id: string; lead_id: string | null; phone: string; fim: string; resultado: string | null; company_id?: string | null }

/** Puro: visitas sem resultado terminadas há >= 24 h. */
export function visitasPendentesDePosVisita(rows: VisitaRow[], agoraMs: number): VisitaRow[] {
  return rows.filter(r => r.resultado == null && agoraMs - Date.parse(r.fim) >= POS_VISITA_MS);
}

/**
 * [3e] Este cron varre a tabela INTEIRA, de todas as empresas. Sem este filtro
 * a visita de um tenant vira uma mensagem enviada pela assistente da EcoSunPower
 * — o cliente dele descobriria o white-label. Reaproveita a mesma regra do
 * dashboard: quem não pode disparar, não dispara. Regra muda num lugar só.
 */
export function visitasQuePodemDisparar(
  rows: VisitaRow[],
  podeDisparar: (companyId: string | null | undefined) => boolean,
): VisitaRow[] {
  return rows.filter(r => podeDisparar(r.company_id));
}

export interface VisitasDeps { client: SupabaseClient; followupVivo: Pick<FollowupVivoService, 'agendarPosVisita'> }

export class VisitasService {
  constructor(private readonly deps: VisitasDeps) {}

  // [3e] companyId: a migration 102 criou a coluna com DEFAULT EcoSun, mas o
  // insert nunca a preenchia — então TODA visita de tenant caía no painel da
  // EcoSunPower (achado em 08/09/2026 com uma visita da Conquista Solar).
  async registrar(v: { leadId: string | null; phone: string; tipo: 'visita' | 'meet'; inicioMs: number; fimMs: number; calendarEventId: string | null; companyId?: string | null }): Promise<void> {
    const { error } = await this.deps.client.from('visitas').insert({
      lead_id: v.leadId, phone: v.phone, tipo: v.tipo,
      inicio: new Date(v.inicioMs).toISOString(), fim: new Date(v.fimMs).toISOString(),
      calendar_event_id: v.calendarEventId, resultado: null,
      ...(v.companyId ? { company_id: v.companyId } : {}),
    });
    if (error) console.error('[visitas] registrar falhou:', error.message);
    else console.log(`[visitas] ${v.tipo} registrada lead=${v.leadId} fim=${new Date(v.fimMs).toISOString()}`);
  }

  async marcarResultado(leadId: string, resultado: 'fechou' | 'cancelada'): Promise<void> {
    const { error } = await this.deps.client.from('visitas').update({ resultado }).eq('lead_id', leadId).is('resultado', null);
    if (error) console.error('[visitas] marcarResultado falhou:', error.message);
  }

  /** Cron: visitas terminadas há >= 24h sem resultado → toque pós-visita. Devolve quantas disparou. */
  async processarPosVisita(agoraMs: number): Promise<number> {
    const { data, error } = await this.deps.client.from('visitas').select('id, lead_id, phone, fim, resultado, company_id')
      .is('resultado', null).lte('fim', new Date(agoraMs - POS_VISITA_MS).toISOString());
    if (error) { console.error('[visitas] busca falhou:', error.message); return 0; }
    let n = 0;
    const devidas = visitasPendentesDePosVisita((data ?? []) as VisitaRow[], agoraMs);
    const minhas = visitasQuePodemDisparar(devidas, podeDispararMensagens);
    if (minhas.length < devidas.length) {
      console.log(`[visitas] ${devidas.length - minhas.length} pós-visita(s) de outra empresa ignorada(s) — ficam no dashboard dela.`);
    }
    for (const v of minhas) {
      try {
        await this.deps.followupVivo.agendarPosVisita({ leadId: v.lead_id, phone: v.phone, agoraMs });
        await this.deps.client.from('visitas').update({ resultado: 'followup_enviado', pos_visita_em: new Date(agoraMs).toISOString() }).eq('id', v.id);
        console.log(`[visitas] pós-visita disparado lead=${v.lead_id} visita=${v.id}`);
        n++;
      } catch (err) {
        console.error(`[visitas] pós-visita falhou visita=${v.id}:`, (err as Error)?.message ?? err);
      }
    }
    return n;
  }
}
