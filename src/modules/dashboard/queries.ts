// Queries do Supabase usadas pelo dashboard.
// Centraliza acesso a dados pra views ficarem so com formato/HTML.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarcaInversor } from '../monitoring/types.js';

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
  // Vendas fechadas = funil real (contrato_assinado+). Mês/ano pela data real
  // do fechamento (contract_signed_at, gravada pelo Coração da Venda).
  vendasTotal: number;
  vendasMesAtual: number;
  vendasAnoAtual: number;
  // Usinas que entraram (sistema cadastrado) neste mês.
  usinasMesAtual: number;
}

// Funil real de venda fechada: a partir de contrato assinado. Mesmo critério
// do /clientes (CLIENTE_STATUSES) — a fonte da verdade de "vendeu".
const VENDA_STATUSES = ['contrato_assinado', 'instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido'];

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
  // followup automatico de proposta
  followup_sent_at: string | null;
  cliente_respondeu_at: string | null;
  followup_skipped_reason: string | null;
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

export interface SistemaMonitorRow {
  id: string;
  apelido: string;
  marca_inversor: MarcaInversor;
  potencia_kwp: number | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  ultima_sincronizacao: string | null;
  ultimo_erro: string | null;
  geracao_hoje_kwh: number | null;
  geracao_mes_kwh: number;
  geracao_7d_kwh: number;
  nivel: 'urgente' | 'aviso' | 'info' | 'ok';
  alertaTexto: string | null;
  garantiaIdade: string;
  garantiaEcosun: string;
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

export async function fetchDashboardKpis(supabase: SupabaseClient, mesRef: Date = new Date()): Promise<DashboardKpi> {
  const now = new Date();
  // Período do filtro — default: mês corrente (mesRef=agora). fimMes/fimAno são o
  // limite SUPERIOR, pra funcionar em meses/anos passados (não só o atual).
  const inicioMes = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1).toISOString();
  const fimMes = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 1).toISOString();
  const inicioAno = new Date(mesRef.getFullYear(), 0, 1).toISOString();
  const fimAno = new Date(mesRef.getFullYear() + 1, 0, 1).toISOString();

  // Conta total propostas
  const { count: totalPropostas } = await supabase
    .from('propostas_publicas')
    .select('id', { count: 'exact', head: true })
    .eq('revoked', false);

  const { count: propostasMesAtual } = await supabase
    .from('propostas_publicas')
    .select('id', { count: 'exact', head: true })
    .eq('revoked', false)
    .gte('created_at', inicioMes)
    .lt('created_at', fimMes);

  const { count: propostasAnoAtual } = await supabase
    .from('propostas_publicas')
    .select('id', { count: 'exact', head: true })
    .eq('revoked', false)
    .gte('created_at', inicioAno)
    .lt('created_at', fimAno);

  // Conta leads
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true });

  const { count: leadsMesAtual } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', inicioMes)
    .lt('created_at', fimMes);

  const { count: leadsQualificando } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'qualificando');

  const { count: clientesInstalados } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('installation_status', ['instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido']);

  // Vendas fechadas (funil real). Total = quem está em contrato_assinado+.
  const { count: vendasTotal } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('installation_status', VENDA_STATUSES);

  // Mês/ano pela DATA real do fechamento (contract_signed_at).
  const { count: vendasMesAtual } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('contract_signed_at', inicioMes)
    .lt('contract_signed_at', fimMes);

  const { count: vendasAnoAtual } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('contract_signed_at', inicioAno)
    .lt('contract_signed_at', fimAno);

  // Usinas que entraram no mês do filtro (sistema cadastrado).
  const { count: usinasMesAtual } = await supabase
    .from('sistemas_clientes')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', inicioMes)
    .lt('created_at', fimMes);

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
    vendasTotal: vendasTotal ?? 0,
    vendasMesAtual: vendasMesAtual ?? 0,
    vendasAnoAtual: vendasAnoAtual ?? 0,
    usinasMesAtual: usinasMesAtual ?? 0,
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
      'id, slug, numero_proposta, cliente_nome, cliente_telefone, created_at, acessos, ultimo_acesso_at, revoked, dados_input, followup_sent_at, cliente_respondeu_at, followup_skipped_reason',
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
    followup_sent_at: p.followup_sent_at ?? null,
    cliente_respondeu_at: p.cliente_respondeu_at ?? null,
    followup_skipped_reason: p.followup_skipped_reason ?? null,
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

// Vendas fechadas por mês (últimos 12 meses), pela DATA real do fechamento
// (contract_signed_at, gravada pelo Coração da Venda). Mesma forma do gráfico
// de propostas — vira a curva de vendas do dashboard.
export async function fetchVendasPorMes(supabase: SupabaseClient): Promise<GraficoMensal[]> {
  const now = new Date();
  const inicio12mesesAtras = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const { data, error } = await supabase
    .from('leads')
    .select('contract_signed_at')
    .gte('contract_signed_at', inicio12mesesAtras.toISOString())
    .order('contract_signed_at', { ascending: true });

  if (error) throw new Error(`fetchVendasPorMes: ${error.message}`);

  const buckets = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, 0);
  }
  for (const row of data ?? []) {
    if (!row.contract_signed_at) continue;
    const d = new Date(row.contract_signed_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([mes, total]) => ({ mes, total }));
}

// ====================================================================
// Módulo 6: alerta proativo — KPIs no painel de monitoramento
// ====================================================================

export interface AlertasResumo { urgente: number; aviso: number; info: number; total: number }

export async function getAlertasAtivosResumo(client: SupabaseClient): Promise<AlertasResumo> {
  const { data, error } = await client
    .from('monitoring_alerts')
    .select('severidade')
    .is('resolved_at', null);
  if (error) return { urgente: 0, aviso: 0, info: 0, total: 0 };
  const c: AlertasResumo = { urgente: 0, aviso: 0, info: 0, total: 0 };
  for (const r of data ?? []) {
    if (r.severidade === 'urgente') c.urgente++;
    else if (r.severidade === 'aviso') c.aviso++;
    else if (r.severidade === 'info') c.info++;
    c.total++;
  }
  return c;
}

export async function getAlertasEnviadosUltimos7d(
  client: SupabaseClient,
): Promise<Array<{ dia: string; enviados: number }>> {
  const ini = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('monitoring_alerts')
    .select('last_sent_at')
    .gte('last_sent_at', ini);
  const por: Record<string, number> = {};
  if (!error) {
    for (const r of data ?? []) {
      if (!r.last_sent_at) continue;
      const dia = r.last_sent_at.slice(0, 10);
      por[dia] = (por[dia] ?? 0) + 1;
    }
  }
  const out: Array<{ dia: string; enviados: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    out.push({ dia: d, enviados: por[d] ?? 0 });
  }
  return out;
}

// ====================================================================
// Módulo 7: Eva Monitoramento Evolutivo — timeline + KPIs de abordagens
// ====================================================================

export interface AbordagemTimelineRow {
  created_at: string;
  tipo: string;
  status: string;
  desfecho: string | null;
  mensagem_enviada: string | null;
  resposta_resumo: string | null;
  nota_junior: string | null;
}

export async function getTimelineAbordagens(
  client: SupabaseClient,
  sistemaId: string,
): Promise<AbordagemTimelineRow[]> {
  const { data, error } = await client
    .from('monitoring_abordagens')
    .select('created_at, tipo, status, desfecho, mensagem_enviada, resposta_resumo, nota_junior')
    .eq('sistema_id', sistemaId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`getTimelineAbordagens: ${error.message}`);
  return (data ?? []) as AbordagemTimelineRow[];
}

export interface KPIsAbordagemMes {
  enviadas: number;
  resolvidoSozinhoCount: number;
  limpezasFechadasCount: number;
  semRespostaCount: number;
  resolvidoSozinhoPct: number; // 0-100
}

export async function getKPIsAbordagemMes(
  client: SupabaseClient,
): Promise<KPIsAbordagemMes> {
  // Mês atual em BRT (UTC-3): primeiro dia = 03:00 UTC do dia 1
  const agora = new Date();
  const anoMes = `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
  // Início do mês corrente às 03:00 UTC (= meia-noite BRT)
  const inicioMes = `${anoMes}-01T03:00:00.000Z`;

  const { data, error } = await client
    .from('monitoring_abordagens')
    .select('desfecho')
    .not('enviada_em', 'is', null)
    .gte('enviada_em', inicioMes);

  // M6: erro NÃO vira zeros falsos — o .catch(() => undefined) do router
  // esconde a seção inteira; melhor sumir que mostrar KPI mentiroso.
  if (error) throw new Error(`getKPIsAbordagemMes: ${error.message}`);

  const enviadas = (data ?? []).length;
  let resolvidoSozinhoCount = 0;
  let limpezasFechadasCount = 0;
  let semRespostaCount = 0;

  for (const row of data ?? []) {
    if (row.desfecho === 'resolvido_sozinho') resolvidoSozinhoCount++;
    else if (row.desfecho === 'limpeza_fechada') limpezasFechadasCount++;
    else if (row.desfecho === 'sem_resposta') semRespostaCount++;
  }

  const resolvidoSozinhoPct = enviadas > 0 ? Math.round((resolvidoSozinhoCount / enviadas) * 100) : 0;

  return { enviadas, resolvidoSozinhoCount, limpezasFechadasCount, semRespostaCount, resolvidoSozinhoPct };
}
