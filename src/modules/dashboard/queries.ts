// Queries do Supabase usadas pelo dashboard.
// Centraliza acesso a dados pra views ficarem so com formato/HTML.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DashboardKpi {
  totalPropostas: number;
  propostasMesAtual: number;
  propostasAnoAtual: number;
  totalLeads: number;
  leadsMesAtual: number;
  leadsQualificando: number;
  clientesInstalados: number;
  manutencaoPendente: number;
  ticketMedio: number; // R$ por proposta (estimado via dados_input.investimento)
}

export interface PropostaRow {
  id: string;
  slug: string;
  numero_proposta: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  created_at: string;
  acessos: number;
  ultimo_acesso_at: string | null;
  revoked: boolean;
  // dados extraidos de dados_input
  kwp?: number | null;
  valorTotal?: number | null;
  cidade?: string | null;
  uf?: string | null;
}

export interface LeadRow {
  id: string;
  name: string | null;
  phone: string;
  status: string | null;
  installation_status: string | null;
  maintenance_client: boolean;
  installed_at: string | null;
  meter_swapped_at: string | null;
  lead_source: string | null;
  created_at: string;
}

export interface ManutencaoRow {
  lead_id: string;
  cliente_nome: string;
  telefone: string;
  scheduled_date: string;
  topic: string;
  status: string;
  installed_at: string | null;
}

// =========================================================================
// KPIs do home
// =========================================================================

export async function fetchDashboardKpis(supabase: SupabaseClient): Promise<DashboardKpi> {
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const inicioAno = new Date(now.getFullYear(), 0, 1).toISOString();

  // Conta total propostas
  const { count: totalPropostas } = await supabase
    .from('propostas_publicas')
    .select('id', { count: 'exact', head: true })
    .eq('revoked', false);

  const { count: propostasMesAtual } = await supabase
    .from('propostas_publicas')
    .select('id', { count: 'exact', head: true })
    .eq('revoked', false)
    .gte('created_at', inicioMes);

  const { count: propostasAnoAtual } = await supabase
    .from('propostas_publicas')
    .select('id', { count: 'exact', head: true })
    .eq('revoked', false)
    .gte('created_at', inicioAno);

  // Conta leads
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true });

  const { count: leadsMesAtual } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', inicioMes);

  const { count: leadsQualificando } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'qualificando');

  const { count: clientesInstalados } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('installation_status', ['instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido']);

  // Manutencao pendente: lembretes com status pending E data ja chegou ou esta proxima (proximos 30 dias)
  const proximos30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { count: manutencaoPendente } = await supabase
    .from('maintenance_reminders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lte('scheduled_date', proximos30);

  // Ticket medio: media do investimento.total das ultimas propostas com dados_input
  const { data: ultimas } = await supabase
    .from('propostas_publicas')
    .select('dados_input')
    .eq('revoked', false)
    .not('dados_input', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  let ticketMedio = 0;
  if (ultimas && ultimas.length > 0) {
    const valores = ultimas
      .map(p => extrairValorTotal(p.dados_input))
      .filter((v): v is number => typeof v === 'number' && v > 0);
    if (valores.length > 0) {
      ticketMedio = Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
    }
  }

  return {
    totalPropostas: totalPropostas ?? 0,
    propostasMesAtual: propostasMesAtual ?? 0,
    propostasAnoAtual: propostasAnoAtual ?? 0,
    totalLeads: totalLeads ?? 0,
    leadsMesAtual: leadsMesAtual ?? 0,
    leadsQualificando: leadsQualificando ?? 0,
    clientesInstalados: clientesInstalados ?? 0,
    manutencaoPendente: manutencaoPendente ?? 0,
    ticketMedio,
  };
}

// =========================================================================
// Lista de propostas paginada
// =========================================================================

export interface ListPropostasOptions {
  limit?: number;
  offset?: number;
  search?: string; // busca em cliente_nome
}

export async function listPropostas(
  supabase: SupabaseClient,
  options: ListPropostasOptions = {},
): Promise<{ rows: PropostaRow[]; total: number }> {
  const { limit = 50, offset = 0, search } = options;

  let query = supabase
    .from('propostas_publicas')
    .select(
      'id, slug, numero_proposta, cliente_nome, cliente_telefone, created_at, acessos, ultimo_acesso_at, revoked, dados_input',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search && search.trim()) {
    query = query.ilike('cliente_nome', `%${search.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`listPropostas: ${error.message}`);

  const rows: PropostaRow[] = (data ?? []).map(p => ({
    id: p.id,
    slug: p.slug,
    numero_proposta: p.numero_proposta,
    cliente_nome: p.cliente_nome,
    cliente_telefone: p.cliente_telefone,
    created_at: p.created_at,
    acessos: p.acessos ?? 0,
    ultimo_acesso_at: p.ultimo_acesso_at,
    revoked: p.revoked ?? false,
    kwp: extrairKwp(p.dados_input),
    valorTotal: extrairValorTotal(p.dados_input),
    cidade: extrairCidade(p.dados_input),
    uf: extrairUf(p.dados_input),
  }));

  return { rows, total: count ?? 0 };
}

// =========================================================================
// Manutencao pendente: lembretes que vao dispararem nos proximos 30 dias
// =========================================================================

export async function listManutencaoPendente(supabase: SupabaseClient): Promise<ManutencaoRow[]> {
  const proximos30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('maintenance_reminders')
    .select(`
      id,
      lead_id,
      scheduled_date,
      topic,
      status,
      leads ( name, phone, installed_at )
    `)
    .eq('status', 'pending')
    .lte('scheduled_date', proximos30)
    .order('scheduled_date', { ascending: true })
    .limit(100);

  if (error) throw new Error(`listManutencaoPendente: ${error.message}`);

  const rows: ManutencaoRow[] = (data ?? []).map((r: any) => ({
    lead_id: r.lead_id,
    cliente_nome: r.leads?.name ?? '(sem nome)',
    telefone: r.leads?.phone ?? '',
    scheduled_date: r.scheduled_date,
    topic: r.topic,
    status: r.status,
    installed_at: r.leads?.installed_at ?? null,
  }));

  return rows;
}

// =========================================================================
// Helpers — extrair campos do JSONB dados_input das propostas
// =========================================================================

function extrairValorTotal(dados: any): number | null {
  if (!dados) return null;
  // dados_input pode ter formatos diversos. Tenta varios paths comuns.
  const candidatos = [
    dados?.investimento?.total,
    dados?.investimento,
    dados?.valorTotal,
    dados?.valor_total,
  ];
  for (const c of candidatos) {
    const num = typeof c === 'number' ? c : parseFloat(c);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function extrairKwp(dados: any): number | null {
  if (!dados) return null;
  const candidatos = [dados?.potenciaKwp, dados?.kwp, dados?.potencia_kwp];
  for (const c of candidatos) {
    const num = typeof c === 'number' ? c : parseFloat(c);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function extrairCidade(dados: any): string | null {
  if (!dados) return null;
  const v = dados?.cidade ?? dados?.cidadeCliente ?? null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function extrairUf(dados: any): string | null {
  if (!dados) return null;
  const v = dados?.uf ?? dados?.ufCliente ?? null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// =========================================================================
// Grafico mensal: contagem de propostas por mes nos ultimos 12 meses
// =========================================================================

export interface GraficoMensal {
  mes: string; // YYYY-MM
  total: number;
}

export async function fetchPropostasPorMes(supabase: SupabaseClient): Promise<GraficoMensal[]> {
  const now = new Date();
  const inicio12mesesAtras = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const { data, error } = await supabase
    .from('propostas_publicas')
    .select('created_at')
    .eq('revoked', false)
    .gte('created_at', inicio12mesesAtras.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw new Error(`fetchPropostasPorMes: ${error.message}`);

  // Bucket por YYYY-MM
  const buckets = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, 0);
  }
  for (const row of data ?? []) {
    const d = new Date(row.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([mes, total]) => ({ mes, total }));
}
