/**
 * ai-summary.ts — Banner "Eva olhando" no topo de Marketing e Leads.
 *
 * Filosofia: 3-5 frases curtas, acionaveis, que aparecem destacadas no header
 * da pagina. Ajuda Junior a saber o que olhar primeiro sem rolar a lista.
 *
 * Cada insight tem severidade (info/warning/critical) pra colorir o banner.
 * Se nao houver insights, banner some.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface Insight {
  text: string;
  severity: 'info' | 'warning' | 'critical';
  emoji: string;
}

export async function buildMarketingInsights(supabase: SupabaseClient): Promise<Insight[]> {
  const insights: Insight[] = [];

  // 1) Campanhas pausadas há mais de 30 dias
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const { count: pausadasVelhas } = await supabase
    .from('marketing_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'paused')
    .lt('last_synced_at', trintaDiasAtras);

  if ((pausadasVelhas ?? 0) >= 3) {
    insights.push({
      emoji: '⏸',
      text: `${pausadasVelhas} campanhas pausadas há mais de 30 dias. Considere arquivar pra limpar a lista.`,
      severity: 'info',
    });
  }

  // 2) Campanhas com CPL acima do critico nos ultimos 7 dias
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const { data: insightsCpl } = await supabase
    .from('meta_ads_insights')
    .select('campaign_id, spend_cents, leads')
    .gte('date_start', seteDiasAtras);

  if (insightsCpl && insightsCpl.length > 0) {
    const aggByCampaign = new Map<number, { spend: number; leads: number }>();
    for (const r of insightsCpl as Array<{ campaign_id: number; spend_cents: number | null; leads: number | null }>) {
      const a = aggByCampaign.get(r.campaign_id) ?? { spend: 0, leads: 0 };
      a.spend += r.spend_cents ?? 0;
      a.leads += r.leads ?? 0;
      aggByCampaign.set(r.campaign_id, a);
    }
    const ids = Array.from(aggByCampaign.keys());
    if (ids.length > 0) {
      const { data: camps } = await supabase
        .from('marketing_campaigns')
        .select('id, name, status, cpl_alerta_brl, cpl_critico_brl')
        .in('id', ids)
        .eq('status', 'active');

      let acimaCritico = 0;
      let acimaAlerta = 0;
      for (const c of (camps ?? []) as Array<{ id: number; cpl_alerta_brl: number | null; cpl_critico_brl: number | null }>) {
        const agg = aggByCampaign.get(c.id);
        if (!agg || agg.leads === 0) continue;
        const cpl = (agg.spend / 100) / agg.leads;
        if (c.cpl_critico_brl != null && cpl > c.cpl_critico_brl) acimaCritico++;
        else if (c.cpl_alerta_brl != null && cpl > c.cpl_alerta_brl) acimaAlerta++;
      }

      if (acimaCritico > 0) {
        insights.push({
          emoji: '🚨',
          text: `${acimaCritico} campanha(s) ativa(s) com CPL acima do crítico nos últimos 7 dias.`,
          severity: 'critical',
        });
      }
      if (acimaAlerta > 0) {
        insights.push({
          emoji: '⚠️',
          text: `${acimaAlerta} campanha(s) ativa(s) com CPL acima do alerta (não-crítico).`,
          severity: 'warning',
        });
      }
    }
  }

  // 3) Criativos em moderação aguardando
  const { count: criativosPendentes } = await supabase
    .from('marketing_creatives')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if ((criativosPendentes ?? 0) >= 1) {
    insights.push({
      emoji: '🎨',
      text: `${criativosPendentes} criativo(s) aguardando sua aprovação.`,
      severity: 'info',
    });
  }

  return insights;
}

export async function buildLeadsInsights(supabase: SupabaseClient): Promise<Insight[]> {
  const insights: Insight[] = [];

  // 1) Leads novos nas últimas 24h
  const umDiaAtras = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count: novos24h } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', umDiaAtras)
    .is('archived_at', null);

  if ((novos24h ?? 0) >= 1) {
    insights.push({
      emoji: '🆕',
      text: `${novos24h} lead(s) novo(s) nas últimas 24h.`,
      severity: 'info',
    });
  }

  // 2) Leads silentes (mais de 24h sem atividade) em status novo/qualificando, SEM cadencia pendente
  const { data: silentes } = await supabase
    .from('leads')
    .select('id')
    .in('status', ['novo', 'qualificando'])
    .lt('updated_at', umDiaAtras)
    .is('archived_at', null)
    .eq('opt_out', false)
    .limit(500);

  if (silentes && silentes.length > 0) {
    const silenteIds = silentes.map((l: any) => l.id);
    const { data: pendingCads } = await supabase
      .from('eva_cadence')
      .select('lead_id')
      .in('lead_id', silenteIds)
      .eq('status', 'pending');
    const comCadenciaSet = new Set((pendingCads ?? []).map((c: any) => c.lead_id));
    const semCadencia = silenteIds.filter((id: string) => !comCadenciaSet.has(id)).length;

    if (semCadencia >= 3) {
      insights.push({
        emoji: '😴',
        text: `${semCadencia} lead(s) silente(s) há mais de 24h sem cadência agendada. Agende ou descarte.`,
        severity: 'warning',
      });
    }
  }

  // 3) Leads agendados mas com data passada (não cumpriu)
  const agora = new Date().toISOString();
  const { count: agendadosPassados } = await supabase
    .from('eva_cadence')
    .select('lead_id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('scheduled_for', agora);

  if ((agendadosPassados ?? 0) >= 5) {
    insights.push({
      emoji: '⏰',
      text: `${agendadosPassados} toque(s) de cadência passaram do horário. Cron pode estar travado.`,
      severity: 'warning',
    });
  }

  return insights;
}

export function renderInsightsBanner(insights: Insight[], dark = false): string {
  if (insights.length === 0) return '';

  const bgClass = dark
    ? 'bg-slate-800/60 border-slate-700'
    : 'bg-gradient-to-r from-sky-50 to-indigo-50 border-sky-200';
  const textClass = dark ? 'text-slate-200' : 'text-slate-700';
  const headerClass = dark ? 'text-cyan-300' : 'text-indigo-700';

  return `
    <div class="${bgClass} border rounded-xl p-4 mb-6">
      <div class="flex items-center gap-2 ${headerClass} text-sm font-semibold mb-2">
        🧠 Eva está observando
      </div>
      <ul class="space-y-1.5 ${textClass} text-sm">
        ${insights.map((i) => {
          const dot = i.severity === 'critical' ? 'text-rose-500' : i.severity === 'warning' ? 'text-amber-500' : 'text-emerald-500';
          return `<li class="flex items-start gap-2"><span class="${dot} mt-0.5">●</span><span>${i.emoji} ${i.text}</span></li>`;
        }).join('')}
      </ul>
    </div>
  `;
}
