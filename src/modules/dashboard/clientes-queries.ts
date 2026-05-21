// src/modules/dashboard/clientes-queries.ts
import type { SupabaseService } from '../supabase.js';
import type { MonitoringService } from '../monitoring/service.js';
import { esperadoDiaKwh } from '../monitoring/classificacao.js';
import { getSignedUrls } from '../anexos/storage.js';
import type { ClienteRow, ClienteDetail, AnexoListItem, SistemaOrfaoCard } from '../clientes/types.js';

const CLIENTE_STATUSES = [
  'contrato_assinado', 'instalado', 'medidor_trocado',
  'operando', 'pos_venda_concluido',
];

export async function listClientes(
  supabase: SupabaseService,
  filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string },
): Promise<{ clientes: ClienteRow[]; sistemasOrfaos: SistemaOrfaoCard[] }> {
  const [clientes, orfaosRaw] = await Promise.all([
    supabase.listClientesByStatus(CLIENTE_STATUSES, filters),
    supabase.listSistemasOrfaos(),
  ]);
  const sistemasOrfaos: SistemaOrfaoCard[] = (orfaosRaw ?? []).map((s: any) => ({
    sistema_id: s.id,
    apelido: s.apelido,
    marca_inversor: s.marca_inversor,
    potencia_kwp: s.potencia_kwp,
    cidade: s.cidade,
    uf: s.uf,
    data_instalacao: s.data_instalacao,
  }));
  return { clientes: clientes as ClienteRow[], sistemasOrfaos };
}

export async function getClienteDetail(
  supabase: SupabaseService,
  monitoring: MonitoringService,
  leadId: string,
): Promise<ClienteDetail | null> {
  const lead = await supabase.getClienteByLeadId(leadId);
  if (!lead) return null;

  const [propostas, alertasAtivos, anexosRaw, manutencoesFuturas, sistemasTodos] = await Promise.all([
    supabase.listPropostasByLeadId(leadId),
    supabase.listAlertasAtivosByLeadId(leadId),
    supabase.listAnexos(leadId),
    supabase.listManutencoesFuturasByLeadId(leadId),
    monitoring.listarParaDashboard() as Promise<any[]>,
  ]);

  // Sistema vinculado
  const sistemaRaw = sistemasTodos.find((s: any) => s.lead_id === leadId);
  let sistema = null;
  if (sistemaRaw) {
    const esperado7 = esperadoDiaKwh(sistemaRaw.potencia_kwp, sistemaRaw.uf) * 7;
    const real7 = sistemaRaw.geracao_7d_kwh ?? 0;
    const ratio = esperado7 > 0 ? real7 / esperado7 : 1;
    sistema = {
      id: sistemaRaw.id,
      apelido: sistemaRaw.apelido,
      marca_inversor: sistemaRaw.marca_inversor,
      potencia_kwp: sistemaRaw.potencia_kwp,
      qtd_paineis: sistemaRaw.qtd_paineis,
      painel_marca: sistemaRaw.painel_marca,
      data_instalacao: sistemaRaw.data_instalacao,
      geracao_7d_kwh: real7,
      geracao_total_kwh: sistemaRaw.geracao_mes_kwh ?? 0,
      ratio_ultimos_7d: ratio,
    };
  }

  // URLs assinadas em batch
  const paths = (anexosRaw ?? []).map((a: any) => a.storage_path).filter(Boolean);
  const urls = paths.length > 0 ? await getSignedUrls(supabase.getClient(), paths, 3600) : {};
  const anexos: AnexoListItem[] = (anexosRaw ?? []).map((a: any) => ({
    id: a.id,
    tipo: a.tipo,
    descricao: a.descricao,
    storage_path: a.storage_path,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
    created_at: a.created_at,
    signed_url: urls[a.storage_path],
  }));

  // Propostas — extrai valor de dados_input
  const propostasMapped = (propostas ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    numero_proposta: p.numero_proposta,
    created_at: p.created_at,
    acessos: p.acessos ?? 0,
    cliente_respondeu_at: p.cliente_respondeu_at,
    valor_total_brl: p.dados_input?.investimento?.total ?? null,
  }));

  // Conversas recentes
  const client = supabase.getClient();
  const convQuery: any = await client.from('conversations').select('messages').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1);
  const messagesAll: any[] = (convQuery?.data?.[0]?.messages as any[]) ?? [];
  const conversas_recentes = messagesAll.slice(-5);

  // Cadência pendente
  const cadQuery: any = await client.from('eva_cadence').select('id').eq('lead_id', leadId).eq('status', 'pending');
  const cadence_pendente = cadQuery?.data?.length ?? 0;

  return {
    ...lead,
    sistema,
    propostas: propostasMapped,
    alertas_ativos: alertasAtivos as any[],
    conversas_recentes,
    cadence_pendente,
    manutencoes_futuras: manutencoesFuturas as any[],
    anexos,
  } as ClienteDetail;
}
