// src/modules/dashboard/cerebro-data.ts
// Snapshot de dados reais do ecossistema pra tela viva do Elo (cérebro). É o
// dado por trás do visual — e também o que aterra o "Pergunte ao Elo" (uma
// tarefa posterior passa esse snapshot pro Claude responder sem inventar
// número). Best-effort: qualquer query que falhar vira 0, nunca derruba a tela.
import type { SupabaseService } from '../supabase.js';
import { CLIENTE_STATUSES } from './clientes-queries.js';

export type SnapshotElo = {
  comercial: { leads: number; negociacao: number; ganhos: number; propostas: number };
  atendimento: { conversas: number };
  marketing: { emailsEnviados: number; emailsAbertos: number; leadsQuentes: number; blog: number; anuncios: number };
  operacao: { usinas: number };
  relacionamento: { clientes: number; manutencoes: number };
  financeiro: { vendas: number };
  elo: { totalEventos: number };
};

// HEAD count numa tabela (não traz linhas, só o total — mesmo padrão de
// SupabaseService.contarEventosPorTipo). Best-effort: erro em qualquer etapa
// (inclusive supabase.getClient() falhando) vira 0 em vez de propagar —
// uma tabela fora do ar não pode derrubar a tela viva inteira.
async function contar(
  supabase: SupabaseService,
  tabela: string,
  aplicarFiltros?: (q: any) => any,
): Promise<number> {
  try {
    const client = supabase.getClient();
    let q = client.from(tabela).select('*', { count: 'exact', head: true });
    if (aplicarFiltros) q = aplicarFiltros(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Monta o retrato numérico atual do ecossistema EcoSunPower — os números
 * reais por trás da tela viva do Elo. Cada contagem roda em paralelo e é
 * independente: uma falhar não afeta as outras.
 *
 * Nomes de tabela/coluna confirmados no código existente (não inventados):
 * - leads.status: enum lead_status inclui 'negociacao' e 'ganho' (migration 057).
 * - leads.installation_status: usado por /clientes (clientes-queries.ts) pra
 *   distinguir quem já virou cliente (CLIENTE_STATUSES).
 * - propostas_publicas, conversations, eventos_elo, sistemas_clientes,
 *   manutencoes, fechamentos: tabelas reais (ver migrations 001/021/040/058/069).
 * - eventos_elo.tipo: 'email_enviado' | 'email_aberto' | 'lead_quente_email'
 *   (ver src/modules/email/email-sequence.ts, email-reacao.ts, resend-events.ts).
 */
export async function montarSnapshotElo(supabase: SupabaseService): Promise<SnapshotElo> {
  const [
    leads,
    negociacao,
    ganhos,
    propostas,
    conversas,
    emailsEnviados,
    emailsAbertos,
    leadsQuentes,
    usinas,
    clientes,
    manutencoes,
    vendas,
    totalEventos,
    blog,
    anuncios,
  ] = await Promise.all([
    contar(supabase, 'leads'),
    contar(supabase, 'leads', (q) => q.eq('status', 'negociacao')),
    contar(supabase, 'leads', (q) => q.eq('status', 'ganho')),
    contar(supabase, 'propostas_publicas'),
    contar(supabase, 'conversations'),
    contar(supabase, 'eventos_elo', (q) => q.eq('tipo', 'email_enviado')),
    contar(supabase, 'eventos_elo', (q) => q.eq('tipo', 'email_aberto')),
    contar(supabase, 'eventos_elo', (q) => q.eq('tipo', 'lead_quente_email')),
    contar(supabase, 'sistemas_clientes'),
    contar(supabase, 'leads', (q) => q.in('installation_status', CLIENTE_STATUSES)),
    contar(supabase, 'manutencoes'),
    contar(supabase, 'fechamentos'),
    contar(supabase, 'eventos_elo'),
    // Casas novas ligadas na espinha (12/07): blog publicado + leads de anúncios.
    // marketing:blog_publicado ainda não tem histórico → usa o blog_drafts
    // publicado (número real de artigos no ar); anúncios conta os bilhetes
    // marketing:lead_ads da espinha (cresce conforme lead de anúncio entra).
    contar(supabase, 'blog_drafts', (q) => q.eq('status', 'published')),
    contar(supabase, 'eventos_elo', (q) => q.eq('tipo', 'marketing:lead_ads')),
  ]);

  return {
    comercial: { leads, negociacao, ganhos, propostas },
    atendimento: { conversas },
    marketing: { emailsEnviados, emailsAbertos, leadsQuentes, blog, anuncios },
    operacao: { usinas },
    relacionamento: { clientes, manutencoes },
    financeiro: { vendas },
    elo: { totalEventos },
  };
}
