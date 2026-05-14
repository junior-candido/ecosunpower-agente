// Queries pro dashboard de visualizacoes de proposta.
//
// Junior pediu (13/05/2026): timeline + KPIs + filtros + exportacao.
// Versao completa, separa preview admin de cliente real nos KPIs.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface VisualizacaoRow {
  id: number;
  proposta_slug: string;
  viewed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  is_preview: boolean;
  referer: string | null;
}

export interface PropostaResumoVisualizacoes {
  slug: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  created_at: string;
  total_aberturas_cliente: number;     // exclui preview admin
  total_aberturas_preview: number;
  primeira_abertura_cliente_at: string | null;
  ultima_abertura_cliente_at: string | null;
  tempo_ate_primeira_abertura_min: number | null;  // minutos entre proposta gerada e 1a abertura
  intervalo_medio_aberturas_min: number | null;    // tempo medio entre re-aberturas
  dias_ativo: number;                  // dias entre criada e ultima abertura
}

export interface VisualizacoesKpis {
  total_aberturas_hoje: number;
  total_aberturas_7d: number;
  propostas_quentes_hoje: number;      // > 3 aberturas em 24h
  taxa_propostas_abertas_pct: number;  // % de propostas com >=1 abertura
}

/** Lista detalhada de visualizacoes pra uma proposta especifica. */
export async function listVisualizacoesPorSlug(
  supabase: SupabaseClient,
  slug: string,
  options: { incluir_preview?: boolean } = {},
): Promise<VisualizacaoRow[]> {
  const incluirPreview = options.incluir_preview ?? false;
  let query = supabase
    .from('proposta_visualizacoes')
    .select('id, proposta_slug, viewed_at, ip_address, user_agent, is_preview, referer')
    .eq('proposta_slug', slug)
    .order('viewed_at', { ascending: false });

  if (!incluirPreview) {
    query = query.eq('is_preview', false);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listVisualizacoesPorSlug: ${error.message}`);
  return (data ?? []) as VisualizacaoRow[];
}

/** Resumo agregado pra uma proposta (KPIs por slug). */
export async function resumoVisualizacoesPorSlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<PropostaResumoVisualizacoes | null> {
  const { data: prop, error: errProp } = await supabase
    .from('propostas_publicas')
    .select('slug, cliente_nome, cliente_telefone, created_at')
    .eq('slug', slug)
    .maybeSingle();
  if (errProp) throw new Error(`resumoVisualizacoes (proposta): ${errProp.message}`);
  if (!prop) return null;

  const { data: vCli, error: errCli } = await supabase
    .from('proposta_visualizacoes')
    .select('viewed_at')
    .eq('proposta_slug', slug)
    .eq('is_preview', false)
    .order('viewed_at', { ascending: true });
  if (errCli) throw new Error(`resumoVisualizacoes (cliente): ${errCli.message}`);

  const { count: cntPrev } = await supabase
    .from('proposta_visualizacoes')
    .select('id', { count: 'exact', head: true })
    .eq('proposta_slug', slug)
    .eq('is_preview', true);

  const aberturasCliente = (vCli ?? []).map((r) => new Date(r.viewed_at).getTime());
  const totalAberturasCliente = aberturasCliente.length;
  const createdAt = new Date(prop.created_at).getTime();

  let tempoAtePrimeiraMin: number | null = null;
  let intervaloMedioMin: number | null = null;
  if (totalAberturasCliente >= 1) {
    tempoAtePrimeiraMin = (aberturasCliente[0] - createdAt) / 60_000;
  }
  if (totalAberturasCliente >= 2) {
    const intervalos: number[] = [];
    for (let i = 1; i < aberturasCliente.length; i++) {
      intervalos.push((aberturasCliente[i] - aberturasCliente[i - 1]) / 60_000);
    }
    intervaloMedioMin = intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
  }

  const ultimaAberturaMs = aberturasCliente[aberturasCliente.length - 1] ?? null;
  const diasAtivo = ultimaAberturaMs
    ? Math.floor((ultimaAberturaMs - createdAt) / (24 * 60 * 60_000))
    : 0;

  return {
    slug: prop.slug,
    cliente_nome: prop.cliente_nome,
    cliente_telefone: prop.cliente_telefone,
    created_at: prop.created_at,
    total_aberturas_cliente: totalAberturasCliente,
    total_aberturas_preview: cntPrev ?? 0,
    primeira_abertura_cliente_at: aberturasCliente[0]
      ? new Date(aberturasCliente[0]).toISOString()
      : null,
    ultima_abertura_cliente_at: ultimaAberturaMs
      ? new Date(ultimaAberturaMs).toISOString()
      : null,
    tempo_ate_primeira_abertura_min:
      tempoAtePrimeiraMin !== null ? Math.round(tempoAtePrimeiraMin) : null,
    intervalo_medio_aberturas_min:
      intervaloMedioMin !== null ? Math.round(intervaloMedioMin) : null,
    dias_ativo: diasAtivo,
  };
}

/** KPIs globais (pra cockpit ou card no /dashboard/propostas). */
export async function kpisVisualizacoesGlobais(
  supabase: SupabaseClient,
): Promise<VisualizacoesKpis> {
  const agora = Date.now();
  const hoje0h = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const ha7dias = new Date(agora - 7 * 24 * 60 * 60_000).toISOString();
  const ha24h = new Date(agora - 24 * 60 * 60_000).toISOString();

  const { count: cntHoje } = await supabase
    .from('proposta_visualizacoes')
    .select('id', { count: 'exact', head: true })
    .eq('is_preview', false)
    .gte('viewed_at', hoje0h);

  const { count: cnt7d } = await supabase
    .from('proposta_visualizacoes')
    .select('id', { count: 'exact', head: true })
    .eq('is_preview', false)
    .gte('viewed_at', ha7dias);

  const { data: aberturas24h } = await supabase
    .from('proposta_visualizacoes')
    .select('proposta_slug')
    .eq('is_preview', false)
    .gte('viewed_at', ha24h);

  const contagensPorSlug = new Map<string, number>();
  for (const r of aberturas24h ?? []) {
    contagensPorSlug.set(r.proposta_slug, (contagensPorSlug.get(r.proposta_slug) ?? 0) + 1);
  }
  const propostasQuentesHoje = Array.from(contagensPorSlug.values()).filter((c) => c > 3).length;

  const { count: totalPropostas } = await supabase
    .from('propostas_publicas')
    .select('id', { count: 'exact', head: true })
    .eq('revoked', false);

  const { count: propostasComAbertura } = await supabase
    .from('propostas_publicas')
    .select('id', { count: 'exact', head: true })
    .eq('revoked', false)
    .gte('acessos', 1);

  const taxa =
    totalPropostas && totalPropostas > 0
      ? (propostasComAbertura ?? 0) * 100 / totalPropostas
      : 0;

  return {
    total_aberturas_hoje: cntHoje ?? 0,
    total_aberturas_7d: cnt7d ?? 0,
    propostas_quentes_hoje: propostasQuentesHoje,
    taxa_propostas_abertas_pct: Math.round(taxa * 10) / 10,
  };
}
