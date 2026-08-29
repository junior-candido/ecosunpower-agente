// src/modules/financeiro/lancamentos-repo.ts
// I/O fino da Caixa de Entrada. Regras puras ficam em lancamentos.ts.
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { competenciaDe, TTL_PENDENTE_MS, type ChaveDuplicado } from './lancamentos.js';
import { normalizarTexto } from './favorecidos.js';

export interface LancamentoRow {
  id: string;
  tipo: 'despesa' | 'entrada';
  status: 'pendente' | 'confirmado' | 'apagado';
  valor: number;
  data_evento: string;
  competencia: string;
  contraparte: string | null;
  descricao: string | null;
  categoria_id: string | null;
  pf_pj: 'PF' | 'PJ' | 'FRONTEIRA' | null;
  lead_id: string | null;
  conta_id: string | null;
  tem_nota: boolean;
  storage_path: string | null;
  extracao: Record<string, unknown> | null;
  created_at: string;
  banco_conta: string;
  favorecido_id: string | null;
  confianca: 'alta' | 'media' | 'baixa' | 'pendente';
  arquivo_id: string | null;
}

const COLS = 'id, tipo, status, valor, data_evento, competencia, contraparte, descricao, categoria_id, pf_pj, lead_id, conta_id, tem_nota, storage_path, extracao, created_at, banco_conta, favorecido_id, confianca, arquivo_id';

export type BancoConta = 'sicoob_cc'|'sicoob_cartao'|'itau_pj'|'itau_pf'|'visa_emp'|'latam'|'santander_pj'|'mercado_pago'|'dinheiro'|'desconhecido';

// Chave de duplicidade: mesmo banco + dia + valor + descrição normalizada (extrato importado 2× não entra 2×).
export function hashDedupe(k: { bancoConta: BancoConta; dataEvento: string; valor: number; descricao: string | null }): string {
  const base = `${k.bancoConta}|${k.dataEvento}|${Math.round(k.valor * 100)}|${normalizarTexto(k.descricao)}`;
  return createHash('sha1').update(base).digest('hex');
}

export async function criarPendente(client: SupabaseClient, l: {
  tipo: 'despesa' | 'entrada'; valor: number; dataEvento: string;
  contraparte: string | null; descricao: string | null; categoriaId: string | null;
  pfPj: 'PF' | 'PJ' | 'FRONTEIRA' | null; leadId: string | null; storagePath: string | null;
  mimeType: string | null; origem: 'zap_midia' | 'zap_texto'; messageId: string | null;
  extracao: Record<string, unknown>; createdBy: string; temNota: boolean;
}): Promise<string> {
  const { data, error } = await client.from('financeiro_lancamentos').insert({
    tipo: l.tipo, status: 'pendente', valor: l.valor, data_evento: l.dataEvento,
    competencia: competenciaDe(l.dataEvento), contraparte: l.contraparte,
    descricao: l.descricao, categoria_id: l.categoriaId, pf_pj: l.pfPj,
    lead_id: l.leadId, storage_path: l.storagePath, mime_type: l.mimeType,
    origem: l.origem, message_id: l.messageId, extracao: l.extracao, created_by: l.createdBy,
    tem_nota: l.temNota,
  }).select('id').single();
  if (error) throw new Error(`criarPendente: ${error.message}`);
  return (data as { id: string }).id;
}

// Fatia 1 "registra sem travar": entra JÁ confirmado, com banco/favorecido/confiança.
// Duplicado (índice único em hash_dedupe) vira Error('DUPLICADO') pro chamador tratar.
export async function criarConfirmado(client: SupabaseClient, l: {
  tipo: 'despesa' | 'entrada'; valor: number; dataEvento: string;
  contraparte: string | null; descricao: string | null; categoriaId: string | null;
  pfPj: 'PF' | 'PJ' | 'FRONTEIRA'; leadId: string | null; storagePath: string | null;
  mimeType: string | null; origem: 'zap_midia' | 'zap_texto' | 'extrato' | 'tela' | 'conta'; messageId: string | null;
  extracao: Record<string, unknown>; createdBy: string; temNota: boolean;
  bancoConta: BancoConta; favorecidoId: string | null; confianca: 'alta' | 'media' | 'baixa' | 'pendente'; arquivoId: string | null;
}): Promise<string> {
  const descDedupe = (l.descricao ?? l.contraparte ?? '').trim() || null;
  const { data, error } = await client.from('financeiro_lancamentos').insert({
    tipo: l.tipo, status: 'confirmado', valor: l.valor, data_evento: l.dataEvento,
    competencia: competenciaDe(l.dataEvento), contraparte: l.contraparte,
    descricao: l.descricao, categoria_id: l.categoriaId, pf_pj: l.pfPj,
    lead_id: l.leadId, storage_path: l.storagePath, mime_type: l.mimeType,
    origem: l.origem, message_id: l.messageId, extracao: l.extracao, created_by: l.createdBy,
    tem_nota: l.temNota, banco_conta: l.bancoConta, favorecido_id: l.favorecidoId,
    confianca: l.confianca, arquivo_id: l.arquivoId,
    // Sem descrição nem contraparte não dá pra afirmar que é o mesmo → sem hash (nunca dedupa).
    hash_dedupe: descDedupe
      ? hashDedupe({ bancoConta: l.bancoConta, dataEvento: l.dataEvento, valor: l.valor, descricao: descDedupe })
      : null,
  }).select('id').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('DUPLICADO');
    throw new Error(`criarConfirmado: ${error.message}`);
  }
  return (data as { id: string }).id;
}

// Confirmados sem favorecido e com confiança baixa/pendente num período — pro resumo semanal.
export async function getSemDono(client: SupabaseClient, deIso: string, ateIso: string): Promise<LancamentoRow[]> {
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .eq('status', 'confirmado').is('favorecido_id', null).in('confianca', ['baixa', 'pendente'])
    .gte('data_evento', deIso).lte('data_evento', ateIso).order('valor', { ascending: false }).limit(100);
  if (error) throw new Error(`getSemDono: ${error.message}`);
  return (data ?? []) as LancamentoRow[];
}

// Admin apontou o dono: grava favorecido/mundo/categoria e sobe a confiança pra alta.
export async function definirFavorecido(client: SupabaseClient, lancamentoId: string, favorecidoId: string, pfPj: 'PF'|'PJ'|'FRONTEIRA', categoriaId: string | null): Promise<void> {
  const { error } = await client.from('financeiro_lancamentos')
    .update({ favorecido_id: favorecidoId, pf_pj: pfPj, categoria_id: categoriaId, confianca: 'alta', updated_at: new Date().toISOString() })
    .eq('id', lancamentoId);
  if (error) throw new Error(`definirFavorecido: ${error.message}`);
}

export async function getLancamento(client: SupabaseClient, id: string): Promise<LancamentoRow | null> {
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(`getLancamento: ${error.message}`);
  return (data as LancamentoRow) ?? null;
}

// Transição de status com CAS no status atual (clique duplo: só o 1º casa).
export async function mudarStatus(
  client: SupabaseClient, id: string,
  de: 'pendente' | 'confirmado', para: 'confirmado' | 'apagado',
  patch: Record<string, unknown> = {},
): Promise<boolean> {
  const { data, error } = await client.from('financeiro_lancamentos')
    .update({ ...patch, status: para, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', de).select('id');
  if (error) throw new Error(`mudarStatus: ${error.message}`);
  return Boolean(data && data.length > 0);
}

// Grava o vínculo da conta num lançamento JÁ confirmado (caso atv: o CAS
// porteiro confirma antes de criar a conta — o id só existe depois).
export async function gravarContaNoLancamento(client: SupabaseClient, id: string, contaId: string): Promise<void> {
  const { error } = await client.from('financeiro_lancamentos')
    .update({ conta_id: contaId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.warn('[caixa-entrada] gravarContaNoLancamento falhou:', error.message);
}

// Reverte um lançamento confirmado de volta pra pendente (compensação quando
// o passo de dinheiro falha DEPOIS do CAS porteiro — vinc/atv).
export async function reverterParaPendente(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('financeiro_lancamentos')
    .update({ status: 'pendente', conta_id: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'confirmado');
  if (error) console.warn('[caixa-entrada] reverterParaPendente falhou:', error.message);
}

// Saldo em aberto de uma conta a receber (null = conta inexistente ou já fechada).
export async function getSaldoConta(client: SupabaseClient, contaId: string): Promise<number | null> {
  const { data, error } = await client.from('financeiro_contas_a_receber')
    .select('valor, valor_recebido, status').eq('id', contaId).maybeSingle();
  if (error || !data) return null;
  const c = data as { valor: number; valor_recebido: number; status: string };
  if (c.status !== 'pendente' && c.status !== 'recebido_parcial') return null;
  return Math.round((Number(c.valor) - Number(c.valor_recebido)) * 100) / 100;
}

export async function atualizarPendente(client: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await client.from('financeiro_lancamentos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pendente');
  if (error) throw new Error(`atualizarPendente: ${error.message}`);
}

// Pendente mais recente "esperando" resposta do admin (campo faltando/correção).
// Janela 1h = só pra ENGOLIR resposta de texto; o GC de 24h (expirarPendentesAntigos)
// é outra coisa — pendente velho ainda confirma por clique explícito.
export async function getPendenteAguardando(client: SupabaseClient, createdBy: string): Promise<LancamentoRow | null> {
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .eq('status', 'pendente').gte('created_at', desde)
    .eq('created_by', createdBy)
    .contains('extracao', { aguardando: true })
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`getPendenteAguardando: ${error.message}`);
  return (data as LancamentoRow) ?? null;
}

export async function getConfirmadosDoDia(client: SupabaseClient, dataEvento: string): Promise<ChaveDuplicado[]> {
  const { data, error } = await client.from('financeiro_lancamentos')
    .select('valor, contraparte, data_evento')
    .eq('status', 'confirmado').eq('data_evento', dataEvento);
  if (error) throw new Error(`getConfirmadosDoDia: ${error.message}`);
  return (data ?? []) as ChaveDuplicado[];
}

// Lançamentos vivos (pendente/confirmado) dos últimos N dias, mais recentes
// primeiro — pro submenu "Apagar lançamento" listar e o admin escolher qual.
export async function getLancamentosRecentes(
  client: SupabaseClient, dias = 30, limite = 10,
): Promise<LancamentoRow[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .in('status', ['pendente', 'confirmado']).gte('created_at', desde)
    .order('created_at', { ascending: false }).limit(limite);
  if (error) throw new Error(`getLancamentosRecentes: ${error.message}`);
  return (data ?? []) as LancamentoRow[];
}

export async function getUltimoConfirmado(client: SupabaseClient): Promise<LancamentoRow | null> {
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .eq('status', 'confirmado').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`getUltimoConfirmado: ${error.message}`);
  return (data as LancamentoRow) ?? null;
}

// Busca por contraparte nos últimos 30 dias (correção "o do posto era 350").
export async function buscarConfirmadoPorContraparte(client: SupabaseClient, termo: string): Promise<LancamentoRow | null> {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const t = termo.replace(/[%_]/g, '\\$&'); // escapa curinga do ilike (nome com % ou _ não vira wildcard)
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .eq('status', 'confirmado').gte('created_at', desde)
    .ilike('contraparte', `%${t}%`)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`buscarConfirmadoPorContraparte: ${error.message}`);
  return (data as LancamentoRow) ?? null;
}

// Varredura preguiçosa: roda ao criar pendente novo (sem cron). >24h expira.
export async function expirarPendentesAntigos(client: SupabaseClient): Promise<void> {
  const limite = new Date(Date.now() - TTL_PENDENTE_MS).toISOString();
  const { error } = await client.from('financeiro_lancamentos')
    .update({ status: 'apagado', updated_at: new Date().toISOString() })
    .eq('status', 'pendente').lt('created_at', limite);
  if (error) console.warn('[caixa-entrada] expirarPendentes falhou:', error.message);
}

export async function getCategorias(client: SupabaseClient): Promise<Array<{ id: string; slug: string; nome: string }>> {
  const { data, error } = await client.from('financeiro_categorias')
    .select('id, slug, nome').eq('ativo', true);
  if (error) throw new Error(`getCategorias: ${error.message}`);
  return (data ?? []) as Array<{ id: string; slug: string; nome: string }>;
}

// Conta a receber em aberto cujo lead casa com o nome citado (entrada → venda).
export async function buscarContaAbertaPorNome(client: SupabaseClient, nome: string):
  Promise<{ id: string; clienteNome: string; saldo: number } | null> {
  const t = nome.replace(/[%_]/g, '\\$&'); // escapa curinga do ilike
  const { data, error } = await client.from('financeiro_contas_a_receber')
    .select('id, valor, valor_recebido, leads!inner(name)')
    .in('status', ['pendente', 'recebido_parcial'])
    .ilike('leads.name', `%${t}%`)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.warn('[caixa-entrada] buscarContaAbertaPorNome falhou:', error.message);
    return null;
  }
  if (!data) return null;
  const d = data as unknown as { id: string; valor: number; valor_recebido: number; leads: { name: string | null } };
  return {
    id: d.id,
    clienteNome: d.leads?.name ?? nome,
    saldo: Math.round((Number(d.valor) - Number(d.valor_recebido)) * 100) / 100,
  };
}
