// src/modules/rh/store.ts
// Acesso a banco/Storage do RH: vagas, candidatos e currículos (bucket privado
// 'curriculos', acesso só por URL assinada — molde de src/modules/anexos/storage.ts).
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CandidaturaValidada } from './validacao.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

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

// ---------------------------------------------------------------------------
// EMPRESA (multi-tenant) — revisão de segurança R18, 28/09/2026.
// As rotas do painel escrevem com o client de SERVIÇO (bypassa o RLS) e, com a
// flag RLS_TENANT_ROTAS desligada, até as leituras usam o serviço. Por isso
// TODA função do painel recebe o company_id da SESSÃO e filtra explicitamente.
// Linha com company_id nulo (anterior à 077) é da casa (EcoSun), como em
// usinaPertenceAoOperador. Sem empresa → erro (falha fechada, nunca "tudo").
// ---------------------------------------------------------------------------

/** Filtro PostgREST da empresa: EcoSun também enxerga company_id nulo. */
export function filtroEmpresa(companyId: string): { tipo: 'eq'; valor: string } | { tipo: 'or'; valor: string } {
  if (!companyId) throw new Error('RH: sem empresa na sessão — não consulto sem company_id');
  return companyId === ECOSUN_COMPANY_ID
    ? { tipo: 'or', valor: `company_id.is.null,company_id.eq.${ECOSUN_COMPANY_ID}` }
    : { tipo: 'eq', valor: companyId };
}

/** Aplica o filtro da empresa numa consulta (select/update/delete). */
export function daEmpresa<Q>(q: Q, companyId: string): Q {
  const f = filtroEmpresa(companyId);
  const b = q as unknown as { eq: (c: string, v: string) => unknown; or: (x: string) => unknown };
  return (f.tipo === 'eq' ? b.eq('company_id', f.valor) : b.or(f.valor)) as Q;
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

// Página pública Trabalhe Conosco (site da EcoSun): só as vagas da CASA — vaga
// de tenant nunca aparece no site da EcoSun.
export async function listarVagasAbertas(client: SupabaseClient, companyId: string = ECOSUN_COMPANY_ID): Promise<Array<Pick<VagaRow, 'id' | 'titulo' | 'descricao' | 'requisitos' | 'cidade' | 'tipo'>>> {
  const { data, error } = await daEmpresa(client
    .from('rh_vagas')
    .select('id,titulo,descricao,requisitos,cidade,tipo')
    .eq('status', 'aberta'), companyId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[rh] listarVagasAbertas:', error.message); return []; }
  return (data ?? []) as Array<Pick<VagaRow, 'id' | 'titulo' | 'descricao' | 'requisitos' | 'cidade' | 'tipo'>>;
}

export async function listarVagas(client: SupabaseClient, companyId: string): Promise<VagaRow[]> {
  const { data, error } = await daEmpresa(client.from('rh_vagas').select('*'), companyId).order('created_at', { ascending: false });
  if (error) { console.warn('[rh] listarVagas:', error.message); return []; }
  return (data ?? []) as VagaRow[];
}

export async function getVaga(client: SupabaseClient, companyId: string, id: string): Promise<VagaRow | null> {
  const { data } = await daEmpresa(client.from('rh_vagas').select('*').eq('id', id), companyId).maybeSingle();
  return (data as VagaRow) ?? null;
}

export async function criarVaga(
  client: SupabaseClient,
  companyId: string,
  v: { titulo: string; descricao: string; requisitos: string; cidade: string; tipo: string },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!v.titulo.trim()) return { ok: false, error: 'Título da vaga é obrigatório.' };
  filtroEmpresa(companyId); // sem empresa → erro
  // company_id explícito: sem ele a vaga nascia com o DEFAULT da 077 (a EcoSun)
  // e a vaga do tenant ia parar no site e na lista da EcoSun.
  const { data, error } = await client.from('rh_vagas').insert({ ...v, titulo: v.titulo.trim(), company_id: companyId }).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function atualizarVaga(
  client: SupabaseClient,
  companyId: string,
  id: string,
  campos: Partial<{ titulo: string; descricao: string; requisitos: string; cidade: string; tipo: string; status: 'aberta' | 'fechada' }>,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await daEmpresa(client.from('rh_vagas').update(campos).eq('id', id), companyId).select('id');
  if (error) return { ok: false, error: error.message };
  if ((data ?? []).length === 0) return { ok: false, error: 'vaga não encontrada' };
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

export async function listarCandidatos(client: SupabaseClient, companyId: string, filtros: FiltrosCandidatos): Promise<CandidatoRow[]> {
  // Melhor nota primeiro (quem ainda não foi triado vai pro fim); empate = mais novo primeiro.
  let query = daEmpresa(client.from('rh_candidatos').select('*'), companyId)
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
  companyId: string,
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
    const { data: atual } = await daEmpresa(client.from('rh_candidatos').select('status,historico').eq('id', id), companyId).maybeSingle();
    if (!atual) return { ok: false, error: 'candidato não encontrado' };
    const statusLido = (atual as { status: string }).status;
    const historico = Array.isArray((atual as { historico: unknown }).historico) ? (atual as CandidatoRow).historico : [];
    historico.push({ de: statusLido, para: novoStatus, quem, quando: new Date().toISOString() });
    const { data: gravadas, error } = await daEmpresa(client
      .from('rh_candidatos')
      .update({ status: novoStatus, historico })
      .eq('id', id)
      .eq('status', statusLido), companyId)
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
// `storageClient` (opcional): a URL assinada sai do STORAGE, que a RLS da 079 NÃO
// cobre (política é das tabelas, não do storage.objects) — com o crachá do tenant
// a assinatura falharia. A LEITURA da tabela usa `client` (isolada pelo RLS); a
// assinatura usa o client de SERVIÇO. Sem vazamento: o path vem da linha que o
// próprio RLS liberou. Ausente = usa o mesmo client (comportamento antigo).
// `companyId` (a rota do painel SEMPRE passa): o candidato tem que ser da
// empresa da sessão — sem isso, com o banco de serviço (flag RLS desligada),
// qualquer logado abria o currículo de outra empresa pelo id.
export async function urlCurriculoDoCandidato(client: SupabaseClient, candidatoId: string, storageClient?: SupabaseClient, companyId?: string): Promise<string | null> {
  const base = client.from('rh_candidatos').select('curriculo_path').eq('id', candidatoId);
  const { data } = await (companyId !== undefined ? daEmpresa(base, companyId) : base).maybeSingle();
  const path = (data as { curriculo_path?: string } | null)?.curriculo_path;
  if (!path) return null;
  return urlCurriculo(storageClient ?? client, path);
}

// Exclusão manual de 1 candidato (botão do dashboard / pedido LGPD do titular).
// PDF primeiro, linha depois — mesma regra da retenção: Storage falhou, a linha
// fica e o botão avisa (sem PDF órfão perdido no bucket).
export async function excluirCandidato(client: SupabaseClient, companyId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await daEmpresa(client.from('rh_candidatos').select('curriculo_path').eq('id', id), companyId).maybeSingle();
  if (!data) return { ok: false, error: 'candidato não encontrado' };
  const path = (data as { curriculo_path: string }).curriculo_path;
  if (path) {
    const rm = await client.storage.from(BUCKET).remove([path]);
    if (rm.error) return { ok: false, error: `não consegui apagar o PDF agora (${rm.error.message}) — tenta de novo` };
  }
  const del = await daEmpresa(client.from('rh_candidatos').delete().eq('id', id), companyId);
  if (del.error) return { ok: false, error: del.error.message };
  return { ok: true };
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
