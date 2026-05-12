// cockpit-queries.ts
// Queries densas pra pagina /dashboard/cockpit. Roda tudo em paralelo
// pra renderizar 1 tela inteira em <500ms.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CockpitKpi {
  label: string;
  value: number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  hint?: string;
}

export interface CockpitData {
  // Topo (3-4 KPIs gigantes)
  kpis: CockpitKpi[];

  // Gauges (semicirculares com ponteiros)
  gauges: {
    evaConversao: { pct: number; numerator: number; denominator: number };
    sistemaSaude: { pct: number; subitens: Array<{ name: string; ok: boolean }> };
  };

  // Funil leads (quantos em cada estagio)
  funil: Array<{ stage: string; count: number; color: string }>;

  // Atividade 24h: 24 buckets horarios (mensagens recebidas + toques cadencia)
  atividade24h: Array<{ hora: number; mensagens: number; cadencia: number }>;

  // Top 5 leads "quentes": status qualificando/agendado, ordenado por updated_at desc
  topLeads: Array<{
    id: string;
    name: string | null;
    phone: string;
    status: string;
    cidade: string | null;
    minutosDesdeAtualizacao: number;
  }>;

  // Mini-status campanha LIVE (Meta Ads)
  campanha: {
    ativas: number;
    spend7d_brl: number;
    leads7d: number;
    cpl7d_brl: number | null;
    ctr7d_pct: number | null;
  };

  // Indicadores em tempo "agora" pra header
  meta: {
    geradoEm: string;
    silentesSemCadencia: number;
    alertasPendentes: number;
  };
}

function brtTodayMidnightUtc(): string {
  // 0h BRT = 3h UTC. Pega meia-noite BRT do dia atual.
  const now = new Date();
  const brtNow = new Date(now.getTime() - 3 * 60 * 60_000); // shift to BRT
  brtNow.setUTCHours(0, 0, 0, 0); // 0h naquela data
  // Reverte pro UTC: 0h BRT eh 3h UTC do mesmo dia
  brtNow.setUTCHours(3, 0, 0, 0);
  return brtNow.toISOString();
}

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function getCockpitData(client: SupabaseClient): Promise<CockpitData> {
  const today0h = brtTodayMidnightUtc();
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const since7d = isoNDaysAgo(7);

  // === Rodar tudo em paralelo. Cada bloco eh resiliente — falha local nao trava o cockpit.
  const [
    qLeadsHoje,
    qSilentes24h,
    qAgendadosHoje,
    qCadenciaHoje,
    qFunil,
    qConversao,
    qAtividadeMessages,
    qAtividadeCadencia,
    qTopLeads,
    qCampaignsActive,
    qInsights7d,
    qSilentSemCad,
    qAlertasPending,
  ] = await Promise.all([
    client.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', today0h),
    client.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('eva_active', true).eq('opt_out', false)
      .in('status', ['novo', 'qualificando', 'qualificado'])
      .lt('updated_at', since24h),
    client.from('leads').select('id', { count: 'exact', head: true })
      .eq('status', 'agendado').gte('updated_at', today0h),
    client.from('eva_cadence').select('id', { count: 'exact', head: true })
      .eq('status', 'sent').gte('sent_at', today0h),
    client.from('leads').select('status'),
    // Conversao Eva em janela de 30d: leads criados nos ultimos 30d, agrupados
    // pelo status atual. Limit alto pq pode ter milhares; 5000 cobre meses fartos.
    client.from('leads').select('status').gte('created_at', since30d).limit(5000),
    client.from('conversations').select('last_message_at').gte('last_message_at', since24h).limit(2000),
    client.from('eva_cadence').select('sent_at').eq('status', 'sent').gte('sent_at', since24h).limit(2000),
    client.from('leads')
      .select('id, name, phone, status, city, updated_at')
      .in('status', ['qualificando', 'qualificado', 'agendado'])
      .eq('eva_active', true)
      .order('updated_at', { ascending: false })
      .limit(5),
    client.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    client.from('meta_ads_insights')
      .select('spend_cents, leads, impressions, clicks')
      .gte('date_start', since7d),
    client.from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('eva_active', true).eq('opt_out', false)
      .in('status', ['novo', 'qualificando', 'qualificado'])
      .lt('updated_at', since24h),
    client.from('marketing_alerts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  // === Monta funil
  const funilCounts: Record<string, number> = { novo: 0, qualificando: 0, qualificado: 0, agendado: 0, cliente_fechado: 0 };
  for (const r of (qFunil.data ?? []) as Array<{ status: string }>) {
    if (funilCounts[r.status] !== undefined) funilCounts[r.status]++;
  }

  // === Eva conversao: (qualificando + agendado + fechado) / total ativos
  let conversaoNum = 0;
  let conversaoDen = 0;
  for (const r of (qConversao.data ?? []) as Array<{ status: string }>) {
    conversaoDen++;
    if (r.status === 'qualificando' || r.status === 'agendado' || r.status === 'cliente_fechado') {
      conversaoNum++;
    }
  }
  const evaConversaoPct = conversaoDen > 0 ? Math.round((conversaoNum / conversaoDen) * 100) : 0;

  // === Atividade 24h em buckets horarios
  const atividade24h: Array<{ hora: number; mensagens: number; cadencia: number }> = [];
  for (let h = 0; h < 24; h++) atividade24h.push({ hora: h, mensagens: 0, cadencia: 0 });
  const nowUtcMs = Date.now();
  for (const r of (qAtividadeMessages.data ?? []) as Array<{ last_message_at: string | null }>) {
    if (!r.last_message_at) continue;
    const hAgo = Math.floor((nowUtcMs - new Date(r.last_message_at).getTime()) / (60 * 60_000));
    if (hAgo >= 0 && hAgo < 24) atividade24h[23 - hAgo].mensagens++;
  }
  for (const r of (qAtividadeCadencia.data ?? []) as Array<{ sent_at: string | null }>) {
    if (!r.sent_at) continue;
    const hAgo = Math.floor((nowUtcMs - new Date(r.sent_at).getTime()) / (60 * 60_000));
    if (hAgo >= 0 && hAgo < 24) atividade24h[23 - hAgo].cadencia++;
  }

  // === Top leads
  const topLeads = ((qTopLeads.data ?? []) as Array<{
    id: string; name: string | null; phone: string; status: string; city: string | null; updated_at: string;
  }>).map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    status: l.status,
    cidade: l.city,
    minutosDesdeAtualizacao: Math.max(0, Math.floor((Date.now() - new Date(l.updated_at).getTime()) / 60_000)),
  }));

  // === Campanha
  const insights = (qInsights7d.data ?? []) as Array<{ spend_cents: number; leads: number | null; impressions: number; clicks: number }>;
  const spendCents = insights.reduce((s, i) => s + (i.spend_cents ?? 0), 0);
  const leads7d = insights.reduce((s, i) => s + (i.leads ?? 0), 0);
  const impressions7d = insights.reduce((s, i) => s + (i.impressions ?? 0), 0);
  const clicks7d = insights.reduce((s, i) => s + (i.clicks ?? 0), 0);
  const spend7d_brl = spendCents / 100;
  const cpl7d_brl = leads7d > 0 ? spend7d_brl / leads7d : null;
  const ctr7d_pct = impressions7d > 0 ? (clicks7d / impressions7d) * 100 : null;

  // === Sistema saude (heuristica simples — todos os subsistemas vitais)
  const subitens = [
    { name: 'WhatsApp WABA', ok: !!process.env.META_WABA_ACCESS_TOKEN },
    { name: 'Supabase', ok: true },  // se chegamos aqui, ok
    { name: 'Eva cron', ok: process.env.EVA_PASSIVE_MODE !== 'true' },
    { name: 'Marketing API', ok: !!process.env.META_WABA_ACCESS_TOKEN },
    { name: 'Anthropic', ok: !!process.env.ANTHROPIC_API_KEY },
  ];
  const okCount = subitens.filter((s) => s.ok).length;
  const sistemaSaudePct = Math.round((okCount / subitens.length) * 100);

  return {
    kpis: [
      { label: 'Leads hoje', value: qLeadsHoje.count ?? 0, hint: 'desde meia-noite BRT' },
      { label: 'Silentes 24h+', value: qSilentes24h.count ?? 0, hint: 'sem responder ha mais de 24h' },
      { label: 'Agendados hoje', value: qAgendadosHoje.count ?? 0, hint: 'status mudou pra agendado hoje' },
      { label: 'Cadência hoje', value: qCadenciaHoje.count ?? 0, hint: 'toques de cadência enviados hoje' },
    ],
    gauges: {
      evaConversao: { pct: evaConversaoPct, numerator: conversaoNum, denominator: conversaoDen },
      sistemaSaude: { pct: sistemaSaudePct, subitens },
    },
    funil: [
      { stage: 'Novos', count: funilCounts['novo'], color: '#06b6d4' },
      { stage: 'Qualificando', count: funilCounts['qualificando'], color: '#22d3ee' },
      { stage: 'Qualificado', count: funilCounts['qualificado'], color: '#d946ef' },
      { stage: 'Agendado', count: funilCounts['agendado'], color: '#fbbf24' },
      { stage: 'Fechado', count: funilCounts['cliente_fechado'], color: '#22c55e' },
    ],
    atividade24h,
    topLeads,
    campanha: {
      ativas: qCampaignsActive.count ?? 0,
      spend7d_brl,
      leads7d,
      cpl7d_brl,
      ctr7d_pct,
    },
    meta: {
      geradoEm: new Date().toISOString(),
      silentesSemCadencia: qSilentSemCad.count ?? 0,
      alertasPendentes: qAlertasPending.count ?? 0,
    },
  };
}
