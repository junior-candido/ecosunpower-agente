// lead-synthesis.ts
// Gera sintese executiva de 1 frase por lead pra Junior bater o olho e
// decidir em 30s. Usa Claude Haiku (modelo barato e rapido), cacheia em
// memoria 6h pra nao re-disparar Claude a cada refresh do cockpit.

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface LeadSynthesis {
  summary: string;          // 1 frase: quem e + o que quer
  temperatura: '🔥' | '⚠️' | '❄️'; // QUENTE / MORNO / FRIO
  suggested_action: string; // 1 frase: o que Junior deveria fazer agora
}

interface CacheEntry {
  data: LeadSynthesis;
  expiresAt: number;
}

const TTL_MS = 6 * 60 * 60_000; // 6h
const cache = new Map<string, CacheEntry>();

const FALLBACK: LeadSynthesis = {
  summary: '(sem síntese ainda — Eva está coletando)',
  temperatura: '❄️',
  suggested_action: 'Aguardar próximo contato',
};

export async function synthesizeLead(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  leadId: string,
): Promise<LeadSynthesis> {
  // Cache hit?
  const cached = cache.get(leadId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    // Busca dados do lead + ultima conversa
    const { data: lead } = await supabase
      .from('leads')
      .select('name, city, status, profile, energy_data, opportunities, updated_at')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return FALLBACK;

    const { data: convs } = await supabase
      .from('conversations')
      .select('messages')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1);

    const msgs = (convs && convs[0]?.messages) ?? [];
    // Pega ultimas 12 trocas pra dar contexto sem estourar tokens
    const lastMsgs = (msgs as Array<{ role: string; content: string }>).slice(-12);
    const conversationText = lastMsgs.map((m) => `${m.role}: ${m.content?.slice(0, 200) ?? ''}`).join('\n');

    const energyData = lead.energy_data as Record<string, unknown> | null;
    const opps = lead.opportunities as Record<string, unknown> | null;

    const systemPrompt = `Vc analisa leads de empresa de energia solar (Ecosunpower) e gera resumo executivo pra Junior (Responsavel Tecnico CREA/CFT) decidir em 30 segundos. Retorne SEMPRE em JSON valido com 3 campos:

{
  "summary": "1 frase com nome, cidade, perfil e o que quer (max 140 chars)",
  "temperatura": "🔥" | "⚠️" | "❄️",
  "suggested_action": "1 frase concreta com proxima acao (max 100 chars)"
}

Temperatura:
- 🔥 QUENTE: cliente perguntou preco, pediu visita, mostrou consumo alto (>800kWh), tem urgencia, ja se demonstrou pronto
- ⚠️ MORNO: cliente coletou dados mas nao avancou pra fechar; duvidoso/pensando
- ❄️ FRIO: lead antigo silente, qualificou mas parou de responder

Sugestao deve ser pratica: "Mandar mensagem perguntando X" ou "Assumir conversa: cliente quer Y" ou "Deixar Eva continuar cadenciar".

Responda SOMENTE o JSON, sem outros caracteres.`;

    const userPrompt = `Lead: ${lead.name ?? 'sem nome'} (${lead.city ?? 'cidade desconhecida'})
Status: ${lead.status}
Perfil: ${lead.profile ?? 'indefinido'}
Dados energia: ${energyData ? JSON.stringify(energyData).slice(0, 400) : 'nao coletado'}
Oportunidades: ${opps ? JSON.stringify(opps).slice(0, 200) : '—'}

Ultimas mensagens da conversa com Eva:
${conversationText || '(sem conversa registrada)'}

Gere o JSON da sintese.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return FALLBACK;
    // Limpa fences markdown se Claude colocou
    const clean = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(clean) as Partial<LeadSynthesis>;

    const data: LeadSynthesis = {
      summary: (parsed.summary ?? FALLBACK.summary).slice(0, 200),
      temperatura: ['🔥', '⚠️', '❄️'].includes(parsed.temperatura as string)
        ? (parsed.temperatura as LeadSynthesis['temperatura'])
        : '❄️',
      suggested_action: (parsed.suggested_action ?? FALLBACK.suggested_action).slice(0, 150),
    };
    cache.set(leadId, { data, expiresAt: Date.now() + TTL_MS });
    return data;
  } catch (err) {
    console.warn(`[lead-synthesis] falha pra lead ${leadId}:`, (err as Error).message);
    return FALLBACK;
  }
}

/**
 * Insights gerais da plataforma — Eva narra o estado da operacao toda
 * pro Junior. Gera 3-5 cards de insight (campanha, leads, sistema,
 * proxima acao). Cache memoria 15min (atualiza mais frequente que
 * sintese de lead individual).
 */
export interface PlatformInsight {
  icone: string;        // emoji: 🔥 🚀 ⚠️ 💡 📊 ✅ 📉 etc
  titulo: string;       // 1-3 palavras
  mensagem: string;     // 1 frase explicativa (max 160 chars)
  prioridade: 'alta' | 'media' | 'baixa';
}

const PLATFORM_CACHE_TTL_MS = 15 * 60_000;
let platformCache: { data: PlatformInsight[]; expiresAt: number } | null = null;

/**
 * Invalida cache de insights gerais + cache individual de leads.
 * Usado quando Junior clica "Recalcular" no cockpit pra forcar regeneracao.
 */
export function invalidateInsightsCache(): void {
  platformCache = null;
  cache.clear();
}

export async function getPlatformInsights(
  supabase: SupabaseClient,
  anthropic: Anthropic,
): Promise<PlatformInsight[]> {
  if (platformCache && platformCache.expiresAt > Date.now()) return platformCache.data;

  try {
    // === Coleta de dados pra dar contexto pra IA
    const hoje0h = new Date();
    hoje0h.setUTCHours(3, 0, 0, 0);
    const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const since48h = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
    const since7d = new Date(); since7d.setUTCDate(since7d.getUTCDate() - 7);

    const [
      qLeadsHoje, qLeadsOntem,
      qQualificadosHoje, qAgendadosHoje,
      qCadenciaHoje, qCadenciaOntem,
      qInsights7d,
      qStatusCount,
      qSilentes,
    ] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', hoje0h.toISOString()),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .gte('created_at', since48h).lt('created_at', hoje0h.toISOString()),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('status', 'qualificado').gte('updated_at', hoje0h.toISOString()),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('status', 'agendado').gte('updated_at', hoje0h.toISOString()),
      supabase.from('eva_cadence').select('id', { count: 'exact', head: true })
        .eq('status', 'sent').gte('sent_at', hoje0h.toISOString()),
      supabase.from('eva_cadence').select('id', { count: 'exact', head: true })
        .eq('status', 'sent').gte('sent_at', since48h).lt('sent_at', hoje0h.toISOString()),
      supabase.from('meta_ads_insights')
        .select('spend_cents, leads, impressions, clicks, date_start, campaign_id')
        .gte('date_start', since7d.toISOString().slice(0, 10)),
      supabase.from('leads').select('status').limit(5000),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('eva_active', true).eq('opt_out', false)
        .in('status', ['novo', 'qualificando', 'qualificado'])
        .lt('updated_at', since24h),
    ]);

    const insights = (qInsights7d.data ?? []) as Array<{ spend_cents: number; leads: number | null; impressions: number; clicks: number; date_start?: string; campaign_id?: number }>;
    const spend7d = insights.reduce((s, i) => s + (i.spend_cents ?? 0), 0) / 100;
    const leads7d = insights.reduce((s, i) => s + (i.leads ?? 0), 0);
    const cpl7d = leads7d > 0 ? spend7d / leads7d : null;
    const ctr7d = (() => {
      const imps = insights.reduce((s, i) => s + (i.impressions ?? 0), 0);
      const clx = insights.reduce((s, i) => s + (i.clicks ?? 0), 0);
      return imps > 0 ? (clx / imps) * 100 : null;
    })();

    // Idade real da campanha (dias desde 1a coleta de insight). Importante:
    // sem isso a IA generaliza "7 dias" mesmo quando a campanha tem 1 dia.
    const datasInsights = insights.map((i) => i.date_start).filter(Boolean) as string[];
    const primeiroInsight = datasInsights.length > 0
      ? datasInsights.sort()[0]
      : null;
    const diasCampanha = primeiroInsight
      ? Math.max(1, Math.ceil((Date.now() - new Date(primeiroInsight + 'T00:00:00-03:00').getTime()) / (24 * 60 * 60_000)))
      : 0;

    const statusCount: Record<string, number> = {};
    for (const r of (qStatusCount.data ?? []) as Array<{ status: string }>) {
      statusCount[r.status] = (statusCount[r.status] ?? 0) + 1;
    }

    const dados = {
      hoje: {
        leads_novos: qLeadsHoje.count ?? 0,
        qualificados: qQualificadosHoje.count ?? 0,
        agendados: qAgendadosHoje.count ?? 0,
        cadencia_disparada: qCadenciaHoje.count ?? 0,
      },
      ontem: {
        leads_novos: qLeadsOntem.count ?? 0,
        cadencia_disparada: qCadenciaOntem.count ?? 0,
      },
      campanha: {
        dias_ativa: diasCampanha,        // IDADE REAL — pode ser 1, nao 7
        gasto_total_brl: spend7d,         // gasto no periodo coberto pelos insights
        leads_total: leads7d,
        cpl_brl: cpl7d,
        ctr_pct: ctr7d,
        observacao: diasCampanha < 3
          ? 'CAMPANHA RECEM-ATIVADA — dados ainda imaturos pra conclusao, esperar pelo menos 3-5 dias antes de julgar performance'
          : diasCampanha < 7
            ? 'Campanha com poucos dias — tendencia indicativa mas nao definitiva'
            : 'Campanha com volume suficiente pra analise',
      },
      base_leads: statusCount,
      silentes_24h_sem_acao: qSilentes.count ?? 0,
    };

    // === Pede pra Claude gerar insights executivos
    const systemPrompt = `Vc eh Eva, engenheira virtual da Ecosunpower. Analisa o estado da plataforma hoje e gera 3 a 5 insights executivos pro Junior (Responsavel Tecnico) saber em 30 segundos o que esta acontecendo e o que priorizar.

⚠️ CONTEXTO CRITICO sobre o que JA EH AUTOMATICO (nao sugira essas acoes pro Junior, ele NAO precisa disparar nada manualmente):
- Cadencia de reengajamento: cron roda a cada 15min, dispara toques automaticamente
- Auto-cadence: cron a cada 1h, agenda toques pra silentes 24h+ automaticamente
- Template "reativacao_lead_v1" (aprovado Meta): disparado automaticamente quando janela 24h fecha
- Digest 3x/dia (7h/12h40/21h BRT): notificacao ja agendada
- Sync Meta Ads insights: a cada 30min automatico
- Monitoramento usinas: a cada 15min automatico

⚠️ CONTEXTO SOBRE CAMPANHA META — RESPEITE A IDADE:
O campo "campanha.dias_ativa" indica HA QUANTOS DIAS a campanha esta ativa.
- Se dias_ativa < 3: NAO tire conclusoes de performance. Dados imaturos. Diga
  algo como "Campanha tem X dia(s) — cedo pra avaliar criativo, observar mais"
- Se dias_ativa < 7: tendencia indicativa apenas. Pode comentar mas com cautela.
- Se dias_ativa >= 7: dados maduros. Pode sugerir acao se metricas ruins.
NUNCA diga "7 dias" se a campanha tem 1 dia. Use SEMPRE o numero real de dias_ativa.
NUNCA conclua "sem conversao" pra campanha com < 3 dias — eh muito cedo.

➡️ So sugira acoes que EXIGEM o Junior agir manualmente:
- "Assumir conversa de cliente X (sinal quente)"
- "Confirmar logistica da visita agendada de Y"
- "Ligar pessoalmente pro lead Z (lead grande)"
- "Aprovar review pendente no site"
- "Revisar campanha que tem CPL alto"
- "Decidir se mantem ou pausa lead que parou de responder"

Cada insight deve ter:
- icone (1 emoji que represente o tema: 🔥 alerta, 🚀 conquista, ⚠️ atencao, 💡 sugestao, 📊 metrica, ✅ ok, 📉 queda, 📈 alta, 🎯 oportunidade)
- titulo (2-3 palavras em PT-BR, ex: "Campanha quente", "Silentes acumulando", "Boas vendas")
- mensagem (1 frase em PT-BR, max 160 chars, com numero concreto. Tom direto, sem rodeios. Pode chamar Junior pela acao MAS so se ela exige acao humana — NUNCA sugira "dispare cadencia" ou "agende toque" porque isso eh automatico)
- prioridade (alta | media | baixa)

REGRAS:
- Sempre PT-BR com acentuacao correta
- Sempre numero concreto (nao "alguns" — diga "12")
- Tom de relatorio executivo: direto, util, sem floreio
- Ordene por prioridade desc (alta primeiro)

Retorne JSON valido sem outros caracteres:
[{"icone":"🔥","titulo":"X","mensagem":"Y","prioridade":"alta"}, ...]`;

    const userPrompt = `Estado atual da plataforma EcoSunPower (${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}):

${JSON.stringify(dados, null, 2)}

Gere 3-5 insights executivos em JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];
    const clean = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(clean) as PlatformInsight[];

    // Validacao + clamp
    const result = parsed.slice(0, 5).map((p) => ({
      icone: (p.icone ?? '📊').slice(0, 4),
      titulo: (p.titulo ?? 'Insight').slice(0, 30),
      mensagem: (p.mensagem ?? '').slice(0, 200),
      prioridade: ['alta', 'media', 'baixa'].includes(p.prioridade as string)
        ? p.prioridade : 'media' as PlatformInsight['prioridade'],
    }));

    platformCache = { data: result, expiresAt: Date.now() + PLATFORM_CACHE_TTL_MS };
    return result;
  } catch (err) {
    console.warn('[platform-insights] falha:', (err as Error).message);
    return [];
  }
}

/**
 * Busca leads que precisam de atencao (qualificado/qualificando > 24h sem
 * agendamento) e gera sintese pra cada um. Limite N=10 pra nao estourar
 * Claude. Roda em paralelo (Promise.all).
 */
export async function getLeadsAguardandoAcao(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  limit: number = 10,
): Promise<Array<{
  id: string;
  name: string | null;
  phone: string;
  status: string;
  cidade: string | null;
  dias_aguardando: number;
  synthesis: LeadSynthesis;
}>> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, phone, status, city, updated_at')
    .in('status', ['qualificado', 'qualificando'])
    .eq('eva_active', true)
    .eq('opt_out', false)
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (!leads || leads.length === 0) return [];

  const sintetizados = await Promise.all(
    leads.map(async (l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      status: l.status,
      cidade: l.city,
      dias_aguardando: Math.floor((Date.now() - new Date(l.updated_at).getTime()) / (24 * 60 * 60_000)),
      synthesis: await synthesizeLead(supabase, anthropic, l.id),
    })),
  );

  // Ordena por temperatura (🔥 primeiro), depois dias_aguardando desc
  const tempRank: Record<string, number> = { '🔥': 0, '⚠️': 1, '❄️': 2 };
  sintetizados.sort((a, b) => {
    const t = (tempRank[a.synthesis.temperatura] ?? 9) - (tempRank[b.synthesis.temperatura] ?? 9);
    if (t !== 0) return t;
    return b.dias_aguardando - a.dias_aguardando;
  });

  return sintetizados;
}
