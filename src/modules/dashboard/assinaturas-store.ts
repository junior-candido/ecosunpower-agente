// src/modules/dashboard/assinaturas-store.ts
// Central de Assinaturas (fatia 1): situação derivada pra tela, novo
// vencimento ao pagar, e acesso a banco (service-role; RLS nega tenants).
// Régua do Junior: vencendo = faltam ≤8 dias (dia do 1º aviso automático).

export type StatusAssinatura = 'ativa' | 'travada' | 'cancelada';
export type Situacao = 'ativa' | 'vencendo' | 'vencida' | 'travada' | 'cancelada';

const DIAS_VENCENDO = 8;

/** Datas em 'YYYY-MM-DD' (comparação de string = comparação de data). */
export function situacaoDaAssinatura(
  a: { status: StatusAssinatura; venceEm: string },
  hoje: string,
): Situacao {
  if (a.status !== 'ativa') return a.status;
  if (hoje > a.venceEm) return 'vencida';
  const dias = Math.round((Date.parse(a.venceEm) - Date.parse(hoje)) / 86_400_000);
  return dias <= DIAS_VENCENDO ? 'vencendo' : 'ativa';
}

function maisUmMes(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const ano = m === 12 ? y! + 1 : y!;
  const mes = m === 12 ? 1 : m! + 1;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // dia 0 do mês seguinte
  const dia = Math.min(d!, ultimoDia);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Pagou: renova a partir do vencimento (adiantado) ou de hoje (atrasado). */
export function novoVencimento(venceEm: string, hoje: string): string {
  return maisUmMes(venceEm >= hoje ? venceEm : hoje);
}

// ============================================================================
// BANCO (service-role — RLS da 090 nega qualquer client de tenant)
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AssinaturaRow {
  id: string; produtoId: string; produtoNome: string; nome: string;
  email: string | null; telefone: string | null; zapConfirmado: boolean;
  valorCentavos: number; limite: number | null; venceEm: string; status: StatusAssinatura;
}

const CAMPOS = 'id, produto_id, nome, email, telefone, zap_confirmado, valor_centavos, limite, vence_em, status, assinatura_produtos(nome)';

function paraRow(r: any): AssinaturaRow {
  return {
    id: r.id, produtoId: r.produto_id, produtoNome: r.assinatura_produtos?.nome ?? r.produto_id,
    nome: r.nome, email: r.email, telefone: r.telefone, zapConfirmado: r.zap_confirmado,
    valorCentavos: r.valor_centavos, limite: r.limite, venceEm: r.vence_em, status: r.status,
  };
}

export async function listarAssinaturas(client: SupabaseClient): Promise<AssinaturaRow[]> {
  const { data, error } = await client
    .from('assinaturas').select(CAMPOS).order('vence_em', { ascending: true });
  if (error) throw new Error(`listarAssinaturas: ${error.message}`);
  return (data ?? []).map(paraRow);
}

export interface ProdutoRow { id: string; nome: string; valorCentavosPadrao: number }

export async function listarProdutos(client: SupabaseClient): Promise<ProdutoRow[]> {
  const { data, error } = await client
    .from('assinatura_produtos').select('id, nome, valor_centavos_padrao').eq('ativo', true).order('nome');
  if (error) throw new Error(`listarProdutos: ${error.message}`);
  return (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome, valorCentavosPadrao: p.valor_centavos_padrao }));
}

export async function criarAssinatura(client: SupabaseClient, d: {
  produtoId: string; nome: string; email?: string | null; telefone?: string | null;
  valorCentavos: number; limite?: number | null; venceEm: string; companyId?: string | null; leadId?: string | null;
}): Promise<string> {
  const { data, error } = await client.from('assinaturas').insert({
    produto_id: d.produtoId, nome: d.nome, email: d.email ?? null, telefone: d.telefone ?? null,
    valor_centavos: d.valorCentavos, limite: d.limite ?? null, vence_em: d.venceEm,
    company_id: d.companyId ?? null, lead_id: d.leadId ?? null,
  }).select('id').single();
  if (error) throw new Error(`criarAssinatura: ${error.message}`);
  return (data as { id: string }).id;
}

export async function getAssinatura(client: SupabaseClient, id: string): Promise<AssinaturaRow | null> {
  const { data } = await client.from('assinaturas').select(CAMPOS).eq('id', id).maybeSingle();
  return data ? paraRow(data) : null;
}

export async function editarAssinatura(client: SupabaseClient, id: string, campos: {
  valorCentavos?: number; telefone?: string | null; limite?: number | null; venceEm?: string;
}): Promise<void> {
  const row: Record<string, unknown> = {};
  if (campos.valorCentavos !== undefined) row.valor_centavos = campos.valorCentavos;
  if (campos.telefone !== undefined) row.telefone = campos.telefone;
  if (campos.limite !== undefined) row.limite = campos.limite;
  if (campos.venceEm !== undefined) row.vence_em = campos.venceEm;
  if (Object.keys(row).length === 0) return;
  const { error } = await client.from('assinaturas').update(row).eq('id', id);
  if (error) throw new Error(`editarAssinatura: ${error.message}`);
}

export async function setStatusAssinatura(client: SupabaseClient, id: string, status: StatusAssinatura): Promise<void> {
  const { error } = await client.from('assinaturas').update({ status }).eq('id', id);
  if (error) throw new Error(`setStatusAssinatura: ${error.message}`);
}

/** Pagamento confirmado: vence_em anda 1 mês e a assinatura volta pra ativa. */
export async function renovarAssinatura(client: SupabaseClient, id: string, hoje: string): Promise<void> {
  const { data } = await client.from('assinaturas').select('vence_em').eq('id', id).maybeSingle();
  if (!data) return;
  const venceEm = (data as { vence_em: string }).vence_em;
  const { error } = await client.from('assinaturas')
    .update({ vence_em: novoVencimento(venceEm, hoje), status: 'ativa' }).eq('id', id);
  if (error) throw new Error(`renovarAssinatura: ${error.message}`);
}
