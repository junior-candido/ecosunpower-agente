// src/modules/dashboard/os-queries.ts
// I/O da Ordem de Serviço. Fotos reusam o bucket client-attachments
// (uploadAnexo/getSignedUrls). Concluir OS ligada reusa marcarManutencaoFeita (2a).
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadAnexo, getSignedUrls } from '../anexos/storage.js';
import { marcarManutencaoFeita } from './manutencao-queries.js';
import type { OSTipo } from './os-checklist.js';

export interface OSRow {
  id: string; sistema_id: string; lead_id: string | null; manutencao_id: string | null;
  tipo: OSTipo; status: string; checklist: Record<string, any> | null; observacoes: string | null;
  executor: string | null; aberta_em: string; concluida_em: string | null;
  apelido?: string | null; clienteNome?: string | null;
}

export async function criarOS(client: SupabaseClient, o: {
  sistemaId: string; leadId: string | null; tipo: OSTipo; manutencaoId?: string | null;
}): Promise<string> {
  const { data, error } = await client.from('ordens_servico').insert({
    sistema_id: o.sistemaId, lead_id: o.leadId, tipo: o.tipo, manutencao_id: o.manutencaoId ?? null, status: 'aberta',
  }).select('id').single();
  if (error) throw new Error(`criarOS: ${error.message}`);
  return (data as { id: string }).id;
}

// Cria OS a partir de uma manutenção agendada (portas a/b).
export async function abrirOSDeManutencao(client: SupabaseClient, manutencaoId: string): Promise<string> {
  const { data: m, error } = await client.from('manutencoes')
    .select('sistema_id, lead_id, tipo').eq('id', manutencaoId).maybeSingle();
  if (error) throw new Error(`abrirOSDeManutencao: ${error.message}`);
  if (!m) throw new Error('abrirOSDeManutencao: manutenção não encontrada');
  const row = m as any;
  return criarOS(client, { sistemaId: row.sistema_id, leadId: row.lead_id, tipo: row.tipo, manutencaoId });
}

export async function getOS(client: SupabaseClient, id: string): Promise<OSRow | null> {
  const { data, error } = await client.from('ordens_servico')
    .select('id, sistema_id, lead_id, manutencao_id, tipo, status, checklist, observacoes, executor, aberta_em, concluida_em, sistemas_clientes(apelido, leads(name))')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(`getOS: ${error.message}`);
  if (!data) return null;
  const r = data as any;
  return {
    id: r.id, sistema_id: r.sistema_id, lead_id: r.lead_id, manutencao_id: r.manutencao_id,
    tipo: r.tipo, status: r.status, checklist: r.checklist, observacoes: r.observacoes,
    executor: r.executor, aberta_em: r.aberta_em, concluida_em: r.concluida_em,
    apelido: r.sistemas_clientes?.apelido ?? null, clienteNome: r.sistemas_clientes?.leads?.name ?? null,
  };
}

export async function salvarOS(client: SupabaseClient, id: string, p: {
  checklist: Record<string, any>; observacoes: string;
}): Promise<void> {
  const { error } = await client.from('ordens_servico')
    .update({ checklist: p.checklist, observacoes: p.observacoes, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'aberta');
  if (error) throw new Error(`salvarOS: ${error.message}`);
}

export interface FotoOS { id: string; item_chave: string | null; storage_path: string; legenda: string | null; url?: string }
export async function listFotosOS(client: SupabaseClient, osId: string, comUrl = false): Promise<FotoOS[]> {
  const { data, error } = await client.from('os_fotos')
    .select('id, item_chave, storage_path, legenda').eq('os_id', osId).order('created_at');
  if (error) throw new Error(`listFotosOS: ${error.message}`);
  const fotos = (data ?? []) as FotoOS[];
  if (comUrl && fotos.length) {
    const urls = await getSignedUrls(client, fotos.map((f) => f.storage_path), 3600 * 24 * 7);
    for (const f of fotos) f.url = urls[f.storage_path] ?? '#';
  }
  return fotos;
}

export async function addFotoOS(client: SupabaseClient, osId: string, p: {
  leadId: string | null; itemChave: string; buffer: Buffer; mimeType: string; ext: string; legenda?: string;
}): Promise<void> {
  // bucket de anexos do cliente; OS avulsa sem lead usa o próprio osId como pasta
  const up = await uploadAnexo(client, p.leadId ?? osId, 'os', p.buffer, p.mimeType, p.ext);
  if (!up.ok || !up.storage_path) throw new Error(`addFotoOS: upload falhou (${up.error ?? '?'})`);
  const { error } = await client.from('os_fotos').insert({
    os_id: osId, item_chave: p.itemChave, storage_path: up.storage_path, legenda: p.legenda ?? null,
  });
  if (error) throw new Error(`addFotoOS: ${error.message}`);
}

// Concluir: se ligada a manutenção, reusa marcarManutencaoFeita (auto-agenda + alerta).
export async function concluirOS(client: SupabaseClient, id: string, p: { executor: string; notas: string }): Promise<{ manutencaoId: string | null }> {
  const os = await getOS(client, id);
  if (!os) throw new Error('concluirOS: OS não encontrada');
  const { error } = await client.from('ordens_servico')
    .update({ status: 'concluida', concluida_em: new Date().toISOString(), executor: p.executor, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'aberta');
  if (error) throw new Error(`concluirOS: ${error.message}`);
  if (os.manutencao_id) {
    await marcarManutencaoFeita(client, os.manutencao_id, {
      feitaEm: new Date().toISOString().slice(0, 10), feitoPor: p.executor, notas: p.notas,
    });
  }
  return { manutencaoId: os.manutencao_id };
}

// Contagem de fotos por item_chave (alimenta hidratarChecklist).
export async function fotoCountsPorItem(client: SupabaseClient, osId: string): Promise<Record<string, number>> {
  const fotos = await listFotosOS(client, osId, false);
  const out: Record<string, number> = {};
  for (const f of fotos) if (f.item_chave) out[f.item_chave] = (out[f.item_chave] ?? 0) + 1;
  return out;
}
