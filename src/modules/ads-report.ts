import { SupabaseClient } from '@supabase/supabase-js';

export interface WeeklyReport {
  period: {
    start: string; // ISO date
    end: string;   // ISO date
    label: string; // "20-26/abr"
  };
  leads: {
    total: number;
    previousWeek: number;
    deltaPct: number; // vs semana anterior
  };
  bySource: Array<{ source: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  topTags: Array<{ campaign: string; count: number; postTopic?: string }>;
  funnel: {
    novos: number;
    qualificando: number;
    qualificados: number;
    agendados: number;
    transferidos: number;
    inativos: number;
  };
}

// Rotula sources internos pra nomes legiveis no relatorio
const SOURCE_LABELS: Record<string, string> = {
  ad_ig_leadform: 'IG Lead Ads',
  ad_fb_leadform: 'FB Lead Ads',
  ad_ig_dm: 'IG DM (anuncio)',
  ad_fb_dm: 'FB DM (anuncio)',
  ad_ig_cta_wa: 'IG anuncio (CTA)',
  ad_fb_cta_wa: 'FB anuncio (CTA)',
  organico_ig: 'IG organico',
  organico_fb: 'FB organico',
  reengajamento_link: 'reengajamento (link)',
  reengajamento_manual: 'reengajamento (manual)',
  indicacao: 'indicacao',
  google_meu_negocio: 'Google Meu Negocio',
  site: 'site',
  direto: 'direto',
};

const STATUS_LABELS: Record<string, string> = {
  novo: 'novo',
  qualificando: 'qualificando',
  qualificado: 'qualificado',
  agendado: 'agendado',
  transferido: 'transferido',
  inativo: 'inativo',
  perdido: 'perdido',
};

export async function generateWeeklyReport(
  supabase: SupabaseClient,
): Promise<WeeklyReport> {
  const now = new Date();
  const weekEnd = now;
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Total leads created this week
  const { data: thisWeekLeads, error: e1 } = await supabase
    .from('leads')
    .select('id, lead_source, status, utm_campaign')
    .gte('created_at', weekStart.toISOString())
    .lte('created_at', weekEnd.toISOString());
  if (e1) throw new Error(`fetch this week failed: ${e1.message}`);

  // Count previous week (for delta)
  const { count: prevCount, error: e2 } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', prevStart.toISOString())
    .lt('created_at', weekStart.toISOString());
  if (e2) throw new Error(`fetch prev week failed: ${e2.message}`);

  const leads = thisWeekLeads ?? [];
  const total = leads.length;
  const previousWeek = prevCount ?? 0;
  const deltaPct = previousWeek === 0
    ? (total > 0 ? 100 : 0)
    : Math.round(((total - previousWeek) / previousWeek) * 100);

  // Group by source
  const sourceMap = new Map<string, number>();
  for (const l of leads) {
    const src = (l.lead_source as string) ?? 'sem_origem';
    sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
  }
  const bySource = Array.from(sourceMap.entries())
    .map(([source, count]) => ({
      source: SOURCE_LABELS[source] ?? source,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Group by status
  const statusMap = new Map<string, number>();
  for (const l of leads) {
    const st = (l.status as string) ?? 'sem_status';
    statusMap.set(st, (statusMap.get(st) ?? 0) + 1);
  }
  const byStatus = Array.from(statusMap.entries())
    .map(([status, count]) => ({
      status: STATUS_LABELS[status] ?? status,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Top tags (post/ad mais eficientes)
  const tagMap = new Map<string, number>();
  for (const l of leads) {
    const tag = l.utm_campaign as string | null;
    if (tag) tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
  }
  const topTagEntries = Array.from(tagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Cruza com marketing_drafts pra pegar topic legivel
  const topTags: WeeklyReport['topTags'] = [];
  for (const [campaign, count] of topTagEntries) {
    let postTopic: string | undefined;
    if (campaign.startsWith('post-')) {
      const { data: draftRow } = await supabase
        .from('marketing_drafts')
        .select('topic')
        .eq('tracking_tag', campaign)
        .maybeSingle();
      postTopic = (draftRow?.topic as string) ?? undefined;
    }
    topTags.push({ campaign, count, postTopic });
  }

  // Funil: conta status atual dos leads desta semana
  const funnel = {
    novos: 0,
    qualificando: 0,
    qualificados: 0,
    agendados: 0,
    transferidos: 0,
    inativos: 0,
  };
  for (const l of leads) {
    switch (l.status) {
      case 'novo': funnel.novos++; break;
      case 'qualificando': funnel.qualificando++; break;
      case 'qualificado': funnel.qualificados++; break;
      case 'agendado': funnel.agendados++; break;
      case 'transferido': funnel.transferidos++; break;
      case 'inativo': funnel.inativos++; break;
    }
  }

  const fmtMonth = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  });
  const label = `${fmtMonth.format(weekStart)} a ${fmtMonth.format(weekEnd)}`;

  return {
    period: {
      start: weekStart.toISOString(),
      end: weekEnd.toISOString(),
      label,
    },
    leads: { total, previousWeek, deltaPct },
    bySource,
    byStatus,
    topTags,
    funnel,
  };
}

// Formata o relatorio pra WhatsApp (texto limpo, sem emoji por padrao — soh
// marcadores estruturais). Max ~20 linhas.
export function formatReportForWhatsApp(report: WeeklyReport): string {
  const { period, leads, bySource, topTags, funnel } = report;

  // Short-circuit: semana sem leads vira mensagem curta em vez de laudo vazio
  if (leads.total === 0 && leads.previousWeek === 0) {
    return `RELATORIO SEMANAL — ${period.label}\n\nSem leads novos essa semana (nem na anterior). Momento de revisar criativo/publico ou aumentar entrega dos anuncios.`;
  }

  const deltaArrow = leads.deltaPct > 0 ? '+' : '';
  const deltaStr = leads.previousWeek === 0 && leads.total === 0
    ? '(sem comparacao)'
    : `${deltaArrow}${leads.deltaPct}% vs semana anterior`;

  const lines: string[] = [];
  lines.push(`RELATORIO SEMANAL — ${period.label}`);
  lines.push('');
  lines.push(`Leads novos: ${leads.total} ${deltaStr}`);
  lines.push('');

  if (bySource.length > 0) {
    lines.push('Por origem:');
    for (const s of bySource) {
      lines.push(`- ${s.source}: ${s.count}`);
    }
    lines.push('');
  }

  lines.push('Funil (status atual dos leads da semana):');
  lines.push(`- novos: ${funnel.novos}`);
  lines.push(`- qualificando: ${funnel.qualificando}`);
  lines.push(`- qualificados: ${funnel.qualificados}`);
  lines.push(`- agendados: ${funnel.agendados}`);
  if (funnel.transferidos > 0) lines.push(`- transferidos: ${funnel.transferidos}`);
  if (funnel.inativos > 0) lines.push(`- inativos: ${funnel.inativos}`);
  lines.push('');

  if (topTags.length > 0) {
    lines.push('Top campanhas/posts:');
    for (const t of topTags) {
      const descr = t.postTopic ? ` (${t.postTopic})` : '';
      lines.push(`- ${t.campaign}${descr}: ${t.count} leads`);
    }
  }

  return lines.join('\n');
}
