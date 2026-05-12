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
