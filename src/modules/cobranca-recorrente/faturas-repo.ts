// src/modules/cobranca-recorrente/faturas-repo.ts
// Banco das FATURAS da cobrança recorrente (migration 146). Roda pelo
// service-role (o robô não tem sessão; as telas filtram a empresa aqui) — a
// RLS da 146 é a segunda trava.
//
// Isolamento: tudo da CASA filtra por dona_company_id; a "Minha assinatura"
// do tenant filtra por company_id (o assinante) — nunca pelo id que vem da URL.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcaoFatura, FaturaCiclo, StatusFatura } from './ciclo.js';

export interface FaturaRow extends FaturaCiclo {
  id: string;
  assinaturaId: string;
  companyId: string | null;
  donaCompanyId: string;
  descricao: string;
  status: StatusFatura;
  cobrancaId: string | null;
  linkUrl: string | null;
  pagoCentavos: number | null;
  taxaCentavos: number | null;
  metodo: string | null;
  formaBaixa: 'link' | 'manual' | null;
  baixadoPor: string | null;
  lancamentoId: string | null;
  reciboEm: string | null;
  canalUltimoAviso: string | null;
  criadoEm: string;
}

const CAMPOS = 'id, assinatura_id, company_id, dona_company_id, competencia, vence_em, valor_centavos, descricao, status, cobranca_id, link_url, pago_em, pago_centavos, taxa_centavos, metodo, forma_baixa, baixado_por, lancamento_id, aviso_fatura_em, aviso_d0_em, aviso_d3_em, aviso_atraso_em, recibo_em, canal_ultimo_aviso, criado_em';

export function paraFatura(r: any): FaturaRow {
  return {
    id: r.id, assinaturaId: r.assinatura_id, companyId: r.company_id ?? null, donaCompanyId: r.dona_company_id,
    competencia: r.competencia, venceEm: r.vence_em, valorCentavos: r.valor_centavos, descricao: r.descricao,
    status: r.status, cobrancaId: r.cobranca_id ?? null, linkUrl: r.link_url ?? null,
    pagoEm: r.pago_em ?? null, pagoCentavos: r.pago_centavos ?? null, taxaCentavos: r.taxa_centavos ?? null,
    metodo: r.metodo ?? null, formaBaixa: r.forma_baixa ?? null, baixadoPor: r.baixado_por ?? null,
    lancamentoId: r.lancamento_id ?? null,
    avisoFaturaEm: r.aviso_fatura_em ?? null, avisoD0Em: r.aviso_d0_em ?? null, avisoD3Em: r.aviso_d3_em ?? null,
    avisoAtrasoEm: r.aviso_atraso_em ?? null, reciboEm: r.recibo_em ?? null,
    canalUltimoAviso: r.canal_ultimo_aviso ?? null, criadoEm: r.criado_em,
  };
}

// ---------------------------------------------------------------------------
// Criar / ler
// ---------------------------------------------------------------------------

export interface NovaFatura {
  assinaturaId: string;
  companyId: string | null;
  donaId: string;
  competencia: string;
  venceEm: string;
  valorCentavos: number;
  descricao: string;
}

/** Cria a fatura do mês. Já existe (unique assinatura+competência) → null. */
export async function criarFatura(client: SupabaseClient, f: NovaFatura): Promise<FaturaRow | null> {
  const { data, error } = await client.from('faturas_assinatura').insert({
    assinatura_id: f.assinaturaId, company_id: f.companyId, dona_company_id: f.donaId,
    competencia: f.competencia, vence_em: f.venceEm, valor_centavos: f.valorCentavos, descricao: f.descricao,
  }).select(CAMPOS).single();
  if (error) {
    if ((error as { code?: string }).code === '23505' || /duplicate|unique/i.test(error.message)) return null;
    throw new Error(`criarFatura: ${error.message}`);
  }
  return data ? paraFatura(data) : null;
}

/** Faturas da casa (lista/KPIs): abertas + as dos últimos meses. */
export async function faturasDaDona(client: SupabaseClient, donaId: string, desde?: string): Promise<FaturaRow[]> {
  let q = client.from('faturas_assinatura').select(CAMPOS).eq('dona_company_id', donaId);
  if (desde) q = q.or(`status.eq.aberta,competencia.gte.${desde}`);
  const { data, error } = await q.order('competencia', { ascending: false }).limit(2000);
  if (error) throw new Error(`faturasDaDona: ${error.message}`);
  return (data ?? []).map(paraFatura);
}

export async function faturasDaAssinatura(client: SupabaseClient, donaId: string, assinaturaId: string): Promise<FaturaRow[]> {
  const { data, error } = await client.from('faturas_assinatura').select(CAMPOS)
    .eq('dona_company_id', donaId).eq('assinatura_id', assinaturaId)
    .order('competencia', { ascending: false }).limit(120);
  if (error) throw new Error(`faturasDaAssinatura: ${error.message}`);
  return (data ?? []).map(paraFatura);
}

/** "Minha assinatura": só as faturas em que a empresa da SESSÃO é a assinante. */
export async function faturasDoTenant(client: SupabaseClient, companyId: string): Promise<FaturaRow[]> {
  if (!companyId) return [];
  const { data, error } = await client.from('faturas_assinatura').select(CAMPOS)
    .eq('company_id', companyId)
    .order('competencia', { ascending: false }).limit(24);
  if (error) throw new Error(`faturasDoTenant: ${error.message}`);
  return (data ?? []).map(paraFatura);
}

export async function getFaturaDaDona(client: SupabaseClient, donaId: string, id: string): Promise<FaturaRow | null> {
  const { data } = await client.from('faturas_assinatura').select(CAMPOS)
    .eq('dona_company_id', donaId).eq('id', id).maybeSingle();
  return data ? paraFatura(data) : null;
}

/** Webhook: a fatura dona desta cobrança (order_nsu → cobrança → fatura). */
export async function getFaturaPorCobranca(client: SupabaseClient, cobrancaId: string): Promise<FaturaRow | null> {
  const { data } = await client.from('faturas_assinatura').select(CAMPOS).eq('cobranca_id', cobrancaId).maybeSingle();
  return data ? paraFatura(data) : null;
}

export async function salvarCobrancaDaFatura(client: SupabaseClient, faturaId: string, cobrancaId: string, linkUrl: string | null): Promise<void> {
  const { error } = await client.from('faturas_assinatura').update({ cobranca_id: cobrancaId, link_url: linkUrl }).eq('id', faturaId);
  if (error) throw new Error(`salvarCobrancaDaFatura: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Avisos (idempotência): reserva a coluna ANTES de enviar
// ---------------------------------------------------------------------------

export type TipoAviso = AcaoFatura | 'recibo';

const COLUNA_AVISO: Record<TipoAviso, string> = {
  fatura: 'aviso_fatura_em',
  lembrete_d0: 'aviso_d0_em',
  lembrete_d3: 'aviso_d3_em',
  atraso_junior: 'aviso_atraso_em',
  recibo: 'recibo_em',
};

/** true = este processo ganhou o direito de enviar (a coluna estava vazia). */
export async function reservarAviso(client: SupabaseClient, faturaId: string, tipo: TipoAviso): Promise<boolean> {
  const col = COLUNA_AVISO[tipo];
  const { data, error } = await client.from('faturas_assinatura')
    .update({ [col]: new Date().toISOString() })
    .eq('id', faturaId).eq('status', tipo === 'recibo' ? 'paga' : 'aberta').is(col, null)
    .select('id');
  if (error) throw new Error(`reservarAviso: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Nenhum canal funcionou → solta a reserva (o robô tenta de novo amanhã). */
export async function liberarAviso(client: SupabaseClient, faturaId: string, tipo: TipoAviso): Promise<void> {
  const { error } = await client.from('faturas_assinatura').update({ [COLUNA_AVISO[tipo]]: null }).eq('id', faturaId);
  if (error) throw new Error(`liberarAviso: ${error.message}`);
}

export async function registrarCanal(client: SupabaseClient, faturaId: string, canal: string): Promise<void> {
  const { error } = await client.from('faturas_assinatura').update({ canal_ultimo_aviso: canal }).eq('id', faturaId);
  if (error) throw new Error(`registrarCanal: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Baixa
// ---------------------------------------------------------------------------

export interface InfoBaixa {
  pagoCentavos: number;
  metodo: string | null;
  formaBaixa: 'link' | 'manual';
  baixadoPor: string | null;
  pagoEm: string;
  taxaCentavos?: number | null;
}

/** Marca paga SÓ se ainda aberta. true = marcou agora (quem ganhou lança no caixa). */
export async function marcarFaturaPaga(client: SupabaseClient, faturaId: string, b: InfoBaixa): Promise<boolean> {
  const { data, error } = await client.from('faturas_assinatura').update({
    status: 'paga', pago_centavos: b.pagoCentavos, metodo: b.metodo, forma_baixa: b.formaBaixa,
    baixado_por: b.baixadoPor, pago_em: b.pagoEm, taxa_centavos: b.taxaCentavos ?? null,
  }).eq('id', faturaId).eq('status', 'aberta').select('id');
  if (error) throw new Error(`marcarFaturaPaga: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function vincularLancamento(client: SupabaseClient, faturaId: string, lancamentoId: string): Promise<void> {
  const { error } = await client.from('faturas_assinatura').update({ lancamento_id: lancamentoId }).eq('id', faturaId);
  if (error) throw new Error(`vincularLancamento: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Trava do robô (vários servidores / deploy no meio do dia)
// ---------------------------------------------------------------------------

/**
 * Só UM processo por dia passa: garante a linha em app_flags e troca o valor
 * pra `hoje` com UPDATE condicional (o Postgres serializa a linha — quem chega
 * depois não acha mais `value <> hoje`). Erro → false (a idempotência das
 * faturas/avisos segura mesmo assim).
 */
export async function reservarExecucaoDoDia(client: SupabaseClient, chave: string, hoje: string): Promise<boolean> {
  try {
    await client.from('app_flags').upsert({ key: chave, value: '-' }, { onConflict: 'key', ignoreDuplicates: true });
    const { data, error } = await client.from('app_flags')
      .update({ value: hoje, updated_at: new Date().toISOString() })
      .eq('key', chave).neq('value', hoje)
      .select('key');
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Prende a cobrança na fatura SÓ se ela ainda não tem uma (dois processos
 * gerando link ao mesmo tempo → um só vence; o outro cancela a dele).
 */
export async function vincularCobrancaSeLivre(client: SupabaseClient, faturaId: string, cobrancaId: string): Promise<boolean> {
  const { data, error } = await client.from('faturas_assinatura')
    .update({ cobranca_id: cobrancaId }).eq('id', faturaId).is('cobranca_id', null).select('id');
  if (error) throw new Error(`vincularCobrancaSeLivre: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
