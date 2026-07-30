// src/modules/dashboard/servicos-store.ts
// Diário de Serviços (F1): registro de campo — tipo + cliente (lead) +
// usina opcional + fotos/vídeos (metadados; arquivos no bucket
// client-attachments). Service-role; RLS da 092 protege a leitura.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TipoServico { id: string; nome: string }

export async function listarTipos(client: SupabaseClient): Promise<TipoServico[]> {
  const { data, error } = await client.from('servico_tipos')
    .select('id, nome').eq('ativo', true).order('nome');
  if (error) throw new Error(`listarTipos: ${error.message}`);
  return (data ?? []).map((t: any) => ({ id: t.id, nome: t.nome }));
}

export async function criarServico(client: SupabaseClient, d: {
  companyId: string | null; tipoId: string; leadId: string; sistemaId?: string | null;
  observacoes?: string | null; dataServico: string; criadoPor?: string | null;
  atribuidoA?: string | null; status?: 'atribuido' | 'concluido';
}): Promise<string> {
  const { data, error } = await client.from('servicos').insert({
    company_id: d.companyId, tipo_id: d.tipoId, lead_id: d.leadId,
    sistema_id: d.sistemaId ?? null, observacoes: d.observacoes ?? null,
    data_servico: d.dataServico, criado_por: d.criadoPor ?? null,
    atribuido_a: d.atribuidoA ?? null,
    status: d.status ?? 'concluido', // preenchido na hora = já concluído
  }).select('id').single();
  if (error) throw new Error(`criarServico: ${error.message}`);
  return (data as { id: string }).id;
}

/** Instalador terminou: marca concluído (observações finais opcionais). */
export async function concluirServico(client: SupabaseClient, id: string, observacoes?: string | null): Promise<void> {
  const row: Record<string, unknown> = { status: 'concluido' };
  if (observacoes !== undefined && observacoes !== null && observacoes !== '') row.observacoes = observacoes;
  const { error } = await client.from('servicos').update(row).eq('id', id);
  if (error) throw new Error(`concluirServico: ${error.message}`);
}

export interface ServicoRow {
  id: string; tipoId: string; tipoNome: string; leadId: string; clienteNome: string;
  sistemaId: string | null; observacoes: string | null; dataServico: string;
  fotos: number; videos: number;
  status: 'atribuido' | 'concluido'; atribuidoA: string | null; atribuidoNome: string | null;
}

const CAMPOS = 'id, tipo_id, lead_id, sistema_id, observacoes, data_servico, criado_em, status, atribuido_a, servico_tipos(nome), leads(name), servico_fotos(tipo_midia), atribuido:dashboard_users!servicos_atribuido_a_fkey(nome)';

function paraRow(r: any): ServicoRow {
  const midias: { tipo_midia: string }[] = r.servico_fotos ?? [];
  return {
    id: r.id, tipoId: r.tipo_id, tipoNome: r.servico_tipos?.nome ?? r.tipo_id,
    leadId: r.lead_id, clienteNome: r.leads?.name ?? '(sem nome)',
    sistemaId: r.sistema_id, observacoes: r.observacoes, dataServico: r.data_servico,
    fotos: midias.filter((m) => m.tipo_midia === 'foto').length,
    videos: midias.filter((m) => m.tipo_midia === 'video').length,
    status: (r.status === 'atribuido' ? 'atribuido' : 'concluido'),
    atribuidoA: r.atribuido_a ?? null,
    atribuidoNome: r.atribuido?.nome ?? null,
  };
}

export async function listarServicos(client: SupabaseClient, limite = 100): Promise<ServicoRow[]> {
  const { data, error } = await client.from('servicos').select(CAMPOS)
    .order('data_servico', { ascending: false }).limit(limite);
  if (error) throw new Error(`listarServicos: ${error.message}`);
  return (data ?? []).map(paraRow);
}

export async function servicosDoLead(client: SupabaseClient, leadId: string): Promise<ServicoRow[]> {
  const { data, error } = await client.from('servicos').select(CAMPOS)
    .eq('lead_id', leadId).order('data_servico', { ascending: false });
  if (error) throw new Error(`servicosDoLead: ${error.message}`);
  return (data ?? []).map(paraRow);
}

export async function getServico(client: SupabaseClient, id: string): Promise<ServicoRow | null> {
  const { data } = await client.from('servicos').select(CAMPOS).eq('id', id).maybeSingle();
  return data ? paraRow(data) : null;
}

export async function registrarMidias(
  client: SupabaseClient,
  servicoId: string,
  companyId: string | null,
  midias: { path: string; tipoMidia: 'foto' | 'video' }[],
): Promise<void> {
  if (midias.length === 0) return;
  const { error } = await client.from('servico_fotos').insert(
    midias.map((m, i) => ({
      servico_id: servicoId, company_id: companyId,
      storage_path: m.path, tipo_midia: m.tipoMidia, ordem: i,
    })),
  );
  if (error) throw new Error(`registrarMidias: ${error.message}`);
}

export async function midiasDoServico(
  client: SupabaseClient,
  servicoId: string,
): Promise<{ path: string; tipoMidia: string; ordem: number }[]> {
  const { data, error } = await client.from('servico_fotos')
    .select('storage_path, tipo_midia, ordem').eq('servico_id', servicoId).order('ordem');
  if (error) throw new Error(`midiasDoServico: ${error.message}`);
  return (data ?? []).map((m: any) => ({ path: m.storage_path, tipoMidia: m.tipo_midia, ordem: m.ordem }));
}
