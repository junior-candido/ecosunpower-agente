// src/modules/financeiro/fiscal/notas-repo.ts
// CRUD de fiscal_notas. Dedupe por hash (company + doc do tomador + valor + competência):
// o índice único do banco é a trava real; aqui só traduzimos o erro pra PT.
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Tomador {
  tipo: 'PJ' | 'PF'; doc: string; nome: string; im: string | null;
  endereco: string; email: string | null; municipio: string; uf: string;
}
export interface NovaNota {
  companyId: string; competencia: string; servicoId: string; descricao: string;
  tomador: Tomador; valorBruto: number; aliquotaIss: number; valorIss: number;
  issRetido: boolean; valorLiquido: number;
  fechamentoId: string | null; leadId: string | null; createdBy: string;
}
export interface NotaLinha {
  id: string; companyId: string; status: string; numero: string | null; competencia: string; descricao: string;
  tomador: Tomador; servicoId: string | null; valorBruto: number; valorIss: number; issRetido: boolean; valorLiquido: number;
  pdfStoragePath: string | null; contaReceberId: string | null;
  chaveAcesso: string | null; ambienteEmissao: 'homologacao' | 'producao' | null; xmlNfse: string | null;
}

export function hashNota(companyId: string, doc: string, valorBruto: number, competencia: string): string {
  const chave = [companyId, doc.replace(/\D/g, ''), valorBruto.toFixed(2), competencia].join('|');
  return createHash('sha256').update(chave).digest('hex');
}

export async function criarNota(client: SupabaseClient, n: NovaNota): Promise<string> {
  const { data, error } = await client.from('fiscal_notas').insert({
    company_id: n.companyId, status: 'preparada', competencia: n.competencia,
    servico_id: n.servicoId, descricao: n.descricao, tomador: n.tomador,
    valor_bruto: n.valorBruto, aliquota_iss: n.aliquotaIss, valor_iss: n.valorIss,
    iss_retido: n.issRetido, valor_liquido: n.valorLiquido,
    fechamento_id: n.fechamentoId, lead_id: n.leadId, created_by: n.createdBy,
    hash_dedupe: hashNota(n.companyId, n.tomador.doc, n.valorBruto, n.competencia),
  }).select('id').single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe nota igual (mesmo tomador, valor e competência). Cancele a antiga ou mude o valor.');
    throw new Error(`criarNota: ${error.message}`);
  }
  return (data as { id: string }).id;
}

export async function anexarPdf(client: SupabaseClient, companyId: string, notaId: string, numero: string, pdfPath: string): Promise<boolean> {
  const { data, error } = await client.from('fiscal_notas')
    .update({ status: 'autorizada', numero, pdf_storage_path: pdfPath, updated_at: new Date().toISOString() })
    .eq('id', notaId).eq('status', 'preparada').eq('company_id', companyId).select('id');
  if (error) throw new Error(`anexarPdf: ${error.message}`);
  return (data ?? []).length === 1;
}

export async function atualizarNotaPreparada(client: SupabaseClient, companyId: string, notaId: string, n: Omit<NovaNota, 'companyId' | 'createdBy'>): Promise<boolean> {
  const { data, error } = await client.from('fiscal_notas')
    .update({
      competencia: n.competencia, servico_id: n.servicoId, descricao: n.descricao, tomador: n.tomador,
      valor_bruto: n.valorBruto, aliquota_iss: n.aliquotaIss, valor_iss: n.valorIss,
      iss_retido: n.issRetido, valor_liquido: n.valorLiquido,
      fechamento_id: n.fechamentoId, lead_id: n.leadId,
      hash_dedupe: hashNota(companyId, n.tomador.doc, n.valorBruto, n.competencia),
      updated_at: new Date().toISOString(),
    })
    .eq('id', notaId).eq('company_id', companyId).eq('status', 'preparada').select('id');
  if (error) {
    if (error.code === '23505') throw new Error('Já existe nota igual (mesmo tomador, valor e competência).');
    throw new Error(`atualizarNotaPreparada: ${error.message}`);
  }
  return (data ?? []).length === 1;
}

/** Destrava nota presa em 'enviada' (conexão caiu no envio) — SÓ depois de conferir no portal que a NFS-e não saiu. */
export async function destravarNotaEnviada(client: SupabaseClient, companyId: string, notaId: string): Promise<boolean> {
  const { data, error } = await client.from('fiscal_notas')
    .update({ status: 'preparada', updated_at: new Date().toISOString() })
    .eq('id', notaId).eq('company_id', companyId).eq('status', 'enviada').select('id');
  if (error) throw new Error(`destravarNotaEnviada: ${error.message}`);
  return (data ?? []).length === 1;
}

export async function excluirNotaPreparada(client: SupabaseClient, companyId: string, notaId: string): Promise<boolean> {
  const { data, error } = await client.from('fiscal_notas')
    .delete()
    .eq('id', notaId).eq('company_id', companyId).eq('status', 'preparada').select('id');
  if (error) throw new Error(`excluirNotaPreparada: ${error.message}`);
  return (data ?? []).length === 1;
}

export async function listarNotas(client: SupabaseClient, companyId: string, limite = 100): Promise<NotaLinha[]> {
  const { data, error } = await client.from('fiscal_notas')
    .select('id, company_id, status, numero, competencia, descricao, tomador, servico_id, valor_bruto, valor_iss, iss_retido, valor_liquido, pdf_storage_path, conta_receber_id, chave_acesso, ambiente_emissao, xml_nfse')
    .eq('company_id', companyId).order('competencia', { ascending: false }).limit(limite);
  if (error) throw new Error(`listarNotas: ${error.message}`);
  return (data ?? []).map(mapearNota);
}

export async function getNota(client: SupabaseClient, companyId: string, notaId: string): Promise<NotaLinha | null> {
  const { data, error } = await client.from('fiscal_notas')
    .select('id, company_id, status, numero, competencia, descricao, tomador, servico_id, valor_bruto, valor_iss, iss_retido, valor_liquido, pdf_storage_path, conta_receber_id, chave_acesso, ambiente_emissao, xml_nfse')
    .eq('id', notaId).eq('company_id', companyId).single();
  if (error) return null;
  return mapearNota(data as Record<string, unknown>);
}

function mapearNota(r: Record<string, unknown>): NotaLinha {
  return {
    id: r.id as string, companyId: r.company_id as string, status: r.status as string, numero: (r.numero as string | null) ?? null,
    competencia: r.competencia as string, descricao: r.descricao as string, tomador: r.tomador as Tomador,
    servicoId: (r.servico_id as string | null) ?? null,
    valorBruto: Number(r.valor_bruto), valorIss: Number(r.valor_iss), issRetido: Boolean(r.iss_retido),
    valorLiquido: Number(r.valor_liquido), pdfStoragePath: (r.pdf_storage_path as string | null) ?? null,
    contaReceberId: (r.conta_receber_id as string | null) ?? null,
    chaveAcesso: (r.chave_acesso as string | null) ?? null,
    ambienteEmissao: (r.ambiente_emissao as 'homologacao' | 'producao' | null) ?? null,
    xmlNfse: (r.xml_nfse as string | null) ?? null,
  };
}

export async function registrarEvento(client: SupabaseClient, notaId: string, tipo: string, detalhe?: unknown): Promise<void> {
  const { error } = await client.from('fiscal_eventos').insert({ nota_id: notaId, tipo, detalhe: detalhe ?? null });
  if (error) throw new Error(`registrarEvento: ${error.message}`);
}

export async function listarServicos(client: SupabaseClient, companyId: string) {
  const { data, error } = await client.from('fiscal_servicos')
    .select('id, nome, cod_trib_nacional, descricao_padrao, aliquota_iss')
    .eq('company_id', companyId).eq('ativo', true).order('nome');
  if (error) throw new Error(`listarServicos: ${error.message}`);
  return (data ?? []) as Array<{ id: string; nome: string; cod_trib_nacional: string; descricao_padrao: string; aliquota_iss: number }>;
}

export async function getConfig(client: SupabaseClient, companyId: string) {
  const { data, error } = await client.from('fiscal_config')
    .select('cnpj, inscricao_municipal, razao_social, cert_validade, ambiente, serie_dps, proximo_ndps, cert_storage_path')
    .eq('company_id', companyId).single();
  if (error) return null;
  return data as {
    cnpj: string; inscricao_municipal: string; razao_social: string; cert_validade: string | null;
    ambiente: 'homologacao' | 'producao'; serie_dps: string; proximo_ndps: number; cert_storage_path: string | null;
  };
}
