// src/modules/rh/store.ts
// Acesso a banco/Storage do RH: vagas, candidatos e currículos (bucket privado
// 'curriculos', acesso só por URL assinada — molde de src/modules/anexos/storage.ts).
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CandidaturaValidada } from './validacao.js';

const BUCKET = 'curriculos';

export const STATUS_VALIDOS = ['novo', 'triado', 'entrevista', 'aprovado', 'reprovado'] as const;
export type StatusCandidato = (typeof STATUS_VALIDOS)[number];

export interface VagaRow {
  id: string;
  titulo: string;
  descricao: string;
  requisitos: string;
  cidade: string;
  tipo: string;
  status: 'aberta' | 'fechada';
  created_at: string;
}

export interface CandidatoRow {
  id: string;
  vaga_id: string | null;
  nome: string;
  telefone: string;
  email: string;
  curriculo_path: string;
  status: StatusCandidato;
  nota_ia: number | null;
  resumo_ia: string | null;
  alertas_ia: string | null;
  historico: Array<{ de: string; para: string; quem: string; quando: string }>;
  created_at: string;
}

// Caminho do PDF no bucket: pasta da vaga (ou banco-talentos) + uuid.
export function montarPathCurriculo(vagaId: string | null): string {
  return `${vagaId ?? 'banco-talentos'}/${randomUUID()}.pdf`;
}

// Corte da retenção LGPD: 365 dias atrás do instante dado.
export function corteRetencao(agoraMs: number): string {
  return new Date(agoraMs - 365 * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// VAGAS
// ---------------------------------------------------------------------------

export async function listarVagasAbertas(client: SupabaseClient): Promise<Array<Pick<VagaRow, 'id' | 'titulo' | 'descricao' | 'requisitos' | 'cidade' | 'tipo'>>> {
  const { data, error } = await client
    .from('rh_vagas')
    .select('id,titulo,descricao,requisitos,cidade,tipo')
    .eq('status', 'aberta')
    .order('created_at', { ascending: false });
  if (error) { console.warn('[rh] listarVagasAbertas:', error.message); return []; }
  return (data ?? []) as Array<Pick<VagaRow, 'id' | 'titulo' | 'descricao' | 'requisitos' | 'cidade' | 'tipo'>>;
}

export async function listarVagas(client: SupabaseClient): Promise<VagaRow[]> {
  const { data, error } = await client.from('rh_vagas').select('*').order('created_at', { ascending: false });
  if (error) { console.warn('[rh] listarVagas:', error.message); return []; }
  return (data ?? []) as VagaRow[];
}

export async function getVaga(client: SupabaseClient, id: string): Promise<VagaRow | null> {
  const { data } = await client.from('rh_vagas').select('*').eq('id', id).maybeSingle();
  return (data as VagaRow) ?? null;
}

export async function criarVaga(
  client: SupabaseClient,
  v: { titulo: string; descricao: string; requisitos: string; cidade: string; tipo: string },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!v.titulo.trim()) return { ok: false, error: 'Título da vaga é obrigatório.' };
  const { data, error } = await client.from('rh_vagas').insert({ ...v, titulo: v.titulo.trim() }).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function atualizarVaga(
  client: SupabaseClient,
  id: string,
  campos: Partial<{ titulo: string; descricao: string; requisitos: string; cidade: string; tipo: string; status: 'aberta' | 'fechada' }>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.from('rh_vagas').update(campos).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CANDIDATOS
// ---------------------------------------------------------------------------

export async function salvarCandidatura(
  client: SupabaseClient,
  dados: CandidaturaValidada,
  pdf: Buffer,
): Promise<{ ok: boolean; error?: string }> {
  const path = montarPathCurriculo(dados.vagaId);
  const up = await client.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  if (up.error) return { ok: false, error: `storage: ${up.error.message}` };
  const { error } = await client.from('rh_candidatos').insert({
    vaga_id: dados.vagaId,
    nome: dados.nome,
    telefone: dados.telefone,
    email: dados.email,
    curriculo_path: path,
    consentimento_em: new Date().toISOString(),
    origem: 'site',
    status: 'novo',
  });
  if (error) {
    await client.storage.from(BUCKET).remove([path]).catch(() => undefined); // não deixa PDF órfão
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export interface FiltrosCandidatos { vagaId?: string; status?: string; q?: string }

export async function listarCandidatos(client: SupabaseClient, filtros: FiltrosCandidatos): Promise<CandidatoRow[]> {
  // Melhor nota primeiro (quem ainda não foi triado vai pro fim); empate = mais novo primeiro.
  let query = client.from('rh_candidatos').select('*')
    .order('nota_ia', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (filtros.vagaId === 'banco') query = query.is('vaga_id', null);
  else if (filtros.vagaId) query = query.eq('vaga_id', filtros.vagaId);
  if (filtros.status && (STATUS_VALIDOS as readonly string[]).includes(filtros.status)) query = query.eq('status', filtros.status);
  if (filtros.q?.trim()) query = query.ilike('nome', `%${filtros.q.trim()}%`);
  const { data, error } = await query;
  if (error) { console.warn('[rh] listarCandidatos:', error.message); return []; }
  return (data ?? []) as CandidatoRow[];
}

export async function mudarStatus(
  client: SupabaseClient,
  id: string,
  novoStatus: string,
  quem: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(STATUS_VALIDOS as readonly string[]).includes(novoStatus)) {
    return { ok: false, error: `status inválido: ${novoStatus}` };
  }
  // Ler-e-gravar com trava otimista: o update só pega se o status ainda for o
  // que a gente leu (.eq status). Dois usuários mexendo juntos não apagam a
  // entrada de histórico um do outro — o segundo relê e tenta de novo.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data: atual } = await client.from('rh_candidatos').select('status,historico').eq('id', id).maybeSingle();
    if (!atual) return { ok: false, error: 'candidato não encontrado' };
    const statusLido = (atual as { status: string }).status;
    const historico = Array.isArray((atual as { historico: unknown }).historico) ? (atual as CandidatoRow).historico : [];
    historico.push({ de: statusLido, para: novoStatus, quem, quando: new Date().toISOString() });
    const { data: gravadas, error } = await client
      .from('rh_candidatos')
      .update({ status: novoStatus, historico })
      .eq('id', id)
      .eq('status', statusLido)
      .select('id');
    if (error) return { ok: false, error: error.message };
    if ((gravadas ?? []).length > 0) return { ok: true };
    // status mudou por baixo — relê e tenta de novo
  }
  return { ok: false, error: 'conflito de edição — tenta de novo' };
}

// URL assinada temporária (10 min) pro dashboard abrir o PDF do cofre privado.
export async function urlCurriculo(client: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// Atalho pro router: candidato -> URL assinada do currículo (null se não achar).
export async function urlCurriculoDoCandidato(client: SupabaseClient, candidatoId: string): Promise<string | null> {
  const { data } = await client.from('rh_candidatos').select('curriculo_path').eq('id', candidatoId).maybeSingle();
  const path = (data as { curriculo_path?: string } | null)?.curriculo_path;
  if (!path) return null;
  return urlCurriculo(client, path);
}

// Retenção LGPD: apaga candidatos (e PDFs) com mais de 12 meses.
// PDF primeiro, linha depois: se o Storage falhar, a linha FICA (tenta de novo
// amanhã) — apagar a linha antes deixaria PDF órfão pra sempre no bucket.
export async function limparCandidatosAntigos(client: SupabaseClient, corteIso: string): Promise<{ apagados: number }> {
  const { data, error } = await client.from('rh_candidatos').select('id,curriculo_path').lt('created_at', corteIso);
  if (error || !data || data.length === 0) return { apagados: 0 };
  const rows = data as Array<{ id: string; curriculo_path: string }>;
  const paths = rows.map((r) => r.curriculo_path).filter(Boolean);
  if (paths.length > 0) {
    const rm = await client.storage.from(BUCKET).remove(paths);
    if (rm.error) {
      console.warn('[rh] retenção: falha ao remover PDFs (linhas mantidas, tenta amanhã):', rm.error.message);
      return { apagados: 0 };
    }
  }
  const del = await client.from('rh_candidatos').delete().in('id', rows.map((r) => r.id));
  if (del.error) { console.warn('[rh] retenção: delete falhou:', del.error.message); return { apagados: 0 }; }
  return { apagados: rows.length };
}
