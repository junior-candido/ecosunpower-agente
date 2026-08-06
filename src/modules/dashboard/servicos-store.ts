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

/** Reabrir: faltou algo — volta pra 🟡 pendente (o instalador completa de novo). */
export async function reabrirServico(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('servicos').update({ status: 'atribuido' }).eq('id', id);
  if (error) throw new Error(`reabrirServico: ${error.message}`);
}

/** 📤 Enviar pelo zap: amarra o serviço em alguém e volta pra 🟡 pendente. */
export async function atribuirServico(client: SupabaseClient, id: string, userId: string): Promise<void> {
  const { error } = await client.from('servicos').update({ atribuido_a: userId, status: 'atribuido' }).eq('id', id);
  if (error) throw new Error(`atribuirServico: ${error.message}`);
}

/** Endereço do cliente numa linha só (zap "só as informações" do 📤 Enviar
 *  pelo zap). Fica aqui e não no router por causa da catraca RLS (tenant-rota-guard). */
export async function enderecoDoLead(client: SupabaseClient, leadId: string): Promise<string | null> {
  const { data } = await client.from('leads')
    .select('endereco_rua, endereco_numero, neighborhood, city')
    .eq('id', leadId).maybeSingle();
  const l = data as { endereco_rua?: string; endereco_numero?: string; neighborhood?: string; city?: string } | null;
  return [l?.endereco_rua, l?.endereco_numero, l?.neighborhood, l?.city].filter(Boolean).join(', ') || null;
}

/** Quantos serviços 🟡 pendentes o usuário ainda tem (regra do acesso temporário). */
export async function contarPendentesDoUsuario(client: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await client.from('servicos')
    .select('id', { count: 'exact', head: true })
    .eq('atribuido_a', userId).eq('status', 'atribuido');
  if (error) throw new Error(`contarPendentesDoUsuario: ${error.message}`);
  return count ?? 0;
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
  campoNome?: string | null;   // LINK MÁGICO: nome de quem faz (sem usuário)
}

const CAMPOS = 'id, tipo_id, lead_id, sistema_id, observacoes, data_servico, criado_em, status, atribuido_a, servico_tipos(nome), leads(name), servico_fotos(tipo_midia), atribuido:dashboard_users!servicos_atribuido_a_fkey(nome)';
// Versão do LINK MÁGICO: mesmos campos + validade/nome do link (checagem de vencimento).
const CAMPOS_CAMPO = CAMPOS + ', excluido_em, campo_expira_em, campo_nome';

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
    campoNome: r.campo_nome ?? null,
  };
}

export async function listarServicos(client: SupabaseClient, limite = 100, lixeira = false): Promise<ServicoRow[]> {
  let q = client.from('servicos').select(CAMPOS);
  // Lixeira (Junior 05/08): excluído some das listas mas é restaurável.
  q = lixeira ? q.not('excluido_em', 'is', null) : q.is('excluido_em', null);
  const { data, error } = await q.order('data_servico', { ascending: false }).limit(limite);
  if (error) throw new Error(`listarServicos: ${error.message}`);
  return (data ?? []).map(paraRow);
}

export async function servicosDoLead(client: SupabaseClient, leadId: string): Promise<ServicoRow[]> {
  const { data, error } = await client.from('servicos').select(CAMPOS)
    .eq('lead_id', leadId).is('excluido_em', null).order('data_servico', { ascending: false });
  if (error) throw new Error(`servicosDoLead: ${error.message}`);
  return (data ?? []).map(paraRow);
}

export async function getServico(client: SupabaseClient, id: string): Promise<ServicoRow | null> {
  const { data } = await client.from('servicos').select(CAMPOS).eq('id', id).maybeSingle();
  return data ? paraRow(data) : null;
}

// ===== LINK MÁGICO do campo (Junior 06/08) =====
// O serviço ganha um link secreto com validade em DIAS — quem recebe trabalha
// direto, SEM usuário/senha/trava. Venceu? O escritório gera outro. O nome de
// quem faz fica registrado no serviço (campo_nome).

export async function gerarLinkCampo(
  client: SupabaseClient,
  servicoId: string,
  nomeQuemFaz: string,
  validadeDias: number,
): Promise<{ slug: string }> {
  const { novoSlug } = await import('../relatorios/slug.js');
  const slug = novoSlug();
  const expira = new Date(Date.now() + Math.max(1, validadeDias) * 24 * 3600 * 1000).toISOString();
  const { error } = await client.from('servicos')
    .update({ campo_slug: slug, campo_expira_em: expira, campo_nome: nomeQuemFaz || null })
    .eq('id', servicoId);
  if (error) throw new Error(`gerarLinkCampo: ${error.message}`);
  return { slug };
}

export async function getServicoPorCampoSlug(
  client: SupabaseClient,
  slug: string,
): Promise<{ ok: true; servico: ServicoRow } | { ok: false; motivo: 'nao_achado' | 'vencido' }> {
  const { data } = await client.from('servicos').select(CAMPOS_CAMPO)
    .eq('campo_slug', slug).maybeSingle();
  if (!data) return { ok: false, motivo: 'nao_achado' };
  const row = data as { campo_expira_em?: string | null; excluido_em?: string | null };
  if (row.excluido_em) return { ok: false, motivo: 'nao_achado' };
  if (row.campo_expira_em && new Date(row.campo_expira_em).getTime() < Date.now()) {
    return { ok: false, motivo: 'vencido' };
  }
  return { ok: true, servico: paraRow(data) };
}

// ===== Lixeira (excluir SEMPRE com desfazer — Junior 05/08) =====
// Excluir = carimbar excluido_em; restaurar = limpar. Nada é apagado.

export async function excluirServico(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('servicos').update({ excluido_em: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`excluirServico: ${error.message}`);
}

export async function restaurarServico(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('servicos').update({ excluido_em: null }).eq('id', id);
  if (error) throw new Error(`restaurarServico: ${error.message}`);
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
