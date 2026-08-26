// src/modules/relatorios/pasta/envio-auto.ts
// Envio automático da Pasta Digital pós-obra — modo (b): quando a pasta está
// PUBLICADA e o lead está com MEDIDOR TROCADO, o Junior recebe no zap um aviso
// com botões [Enviar agora] [Segurar] [Ver pasta]. Nada vai ao cliente sem o
// toque dele. "Segurar" lembra de novo no dia seguinte às 9h (máx. 5 lembretes).
// Spec: docs/superpowers/specs/2026-08-26-pasta-envio-automatico-design.md
import { dentroDaJanela } from '../../monitoring/proactive-alerts/janela.js';

export const MAX_LEMBRETES = 5;
const DASHBOARD_BASE = 'https://dashboard.ecosunpower.eng.br';

export interface PastaCandidata {
  id: string;
  lead_id: string;
  slug: string;
  aviso_envio_em: string | null;
  aviso_segurado_ate: string | null;
  avisos_enviados: number;
  lead: { name: string | null; phone: string | null; meter_swapped_at: string | null };
}

export interface EnvioAutoDb {
  /** Pastas publicadas, ainda não enviadas, cujo lead está em medidor_trocado. */
  listarCandidatas(): Promise<PastaCandidata[]>;
  /** Registra que o Junior foi avisado agora (incrementa avisos_enviados, limpa segurado_ate). */
  marcarAvisado(pastaId: string, agoraIso: string): Promise<void>;
  /** "Segurar": próximo lembrete em `ateIso`. */
  segurar(pastaId: string, ateIso: string): Promise<void>;
}

export interface EnvioAutoCtx {
  db: EnvioAutoDb;
  adminPhone: string;
  enviarComBotoes: (to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string) => Promise<void>;
  agora?: () => Date;
}

/** Quem precisa de aviso NESTE tick (regra R6/R8). */
export function precisaAvisar(p: PastaCandidata, agora: Date): boolean {
  if (!p.aviso_envio_em) return true;                              // 1º aviso
  if (!p.aviso_segurado_ate) return false;                         // já avisado e não segurou → espera o botão
  if (p.avisos_enviados >= MAX_LEMBRETES) return false;            // desiste de lembrar (fica só no dashboard)
  return new Date(p.aviso_segurado_ate).getTime() <= agora.getTime();
}

/** Próximo dia às 9h de Brasília (UTC-3 → 12:00Z). */
export function proximoLembrete9h(agora: Date): Date {
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + 1, 12, 0, 0));
  return d;
}

export function montarAviso(p: PastaCandidata, lembrete: boolean): { body: string; buttons: Array<{ id: string; title: string }>; footer: string } {
  const nome = p.lead.name ?? 'Cliente sem nome';
  const quando = p.lead.meter_swapped_at
    ? new Date(p.lead.meter_swapped_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'data não informada';
  const body = (lembrete ? '⏰ Lembrete · ' : '') +
    `📁 Pasta digital de *${nome}* está pronta e o medidor foi trocado em ${quando}.\n\n` +
    `Enviar a pasta pro cliente agora?`;
  return {
    body,
    buttons: [
      { id: `evabt:pasta-enviar:${p.id}`, title: '📤 Enviar agora' },
      { id: `evabt:pasta-segurar:${p.id}`, title: '⏸ Segurar' },
      { id: `evabt:pasta-ver:${p.id}`, title: '👁 Ver pasta' },
    ],
    footer: lembrete ? `lembrete ${p.avisos_enviados}/${MAX_LEMBRETES}` : 'EcoSun · pasta pós-obra',
  };
}

/** Um tick do cron (15 min). Só age dentro da janela 8h–20h. */
export async function tickEnvioAutoPasta(ctx: EnvioAutoCtx): Promise<{ avisados: number; janelaAberta: boolean }> {
  const agora = (ctx.agora ?? (() => new Date()))();
  if (!dentroDaJanela(agora)) return { avisados: 0, janelaAberta: false };
  const candidatas = await ctx.db.listarCandidatas();
  let avisados = 0;
  for (const p of candidatas) {
    if (!precisaAvisar(p, agora)) continue;
    const lembrete = !!p.aviso_envio_em;
    const msg = montarAviso(p, lembrete);
    try {
      await ctx.enviarComBotoes(ctx.adminPhone, msg.body, msg.buttons, msg.footer);
      await ctx.db.marcarAvisado(p.id, agora.toISOString());
      avisados++;
    } catch (err) {
      console.error('[pasta-envio-auto] falha ao avisar', p.id, (err as Error).message);
    }
  }
  if (avisados > 0) console.log(`[pasta-envio-auto] tick: ${avisados} aviso(s), ${candidatas.length} candidata(s)`);
  return { avisados, janelaAberta: true };
}

export function linkPastaDashboard(pastaId: string): string {
  return `${DASHBOARD_BASE}/dashboard/pastas/${pastaId}`;
}

/** Implementação real em cima do supabase-js (tabelas pastas_cliente + leads). */
export function criarEnvioAutoDb(client: any): EnvioAutoDb {
  return {
    async listarCandidatas() {
      const { data, error } = await client
        .from('pastas_cliente')
        .select('id, lead_id, slug, aviso_envio_em, aviso_segurado_ate, avisos_enviados, leads!inner(name, phone, installation_status, meter_swapped_at)')
        .eq('status', 'publicada')
        .is('enviado_em', null)
        .eq('leads.installation_status', 'medidor_trocado')
        .limit(50);
      if (error) { console.warn('[pasta-envio-auto] listarCandidatas:', error.message); return []; }
      return (data ?? []).map((r: any) => ({
        id: r.id, lead_id: r.lead_id, slug: r.slug,
        aviso_envio_em: r.aviso_envio_em ?? null,
        aviso_segurado_ate: r.aviso_segurado_ate ?? null,
        avisos_enviados: Number(r.avisos_enviados ?? 0),
        lead: { name: r.leads?.name ?? null, phone: r.leads?.phone ?? null, meter_swapped_at: r.leads?.meter_swapped_at ?? null },
      }));
    },
    async marcarAvisado(pastaId, agoraIso) {
      const { data } = await client.from('pastas_cliente').select('avisos_enviados, aviso_envio_em').eq('id', pastaId).single();
      await client.from('pastas_cliente').update({
        aviso_envio_em: data?.aviso_envio_em ?? agoraIso,
        aviso_segurado_ate: null,
        avisos_enviados: Number(data?.avisos_enviados ?? 0) + 1,
        updated_at: agoraIso,
      }).eq('id', pastaId);
    },
    async segurar(pastaId, ateIso) {
      await client.from('pastas_cliente').update({ aviso_segurado_ate: ateIso, updated_at: new Date().toISOString() }).eq('id', pastaId);
    },
  };
}
