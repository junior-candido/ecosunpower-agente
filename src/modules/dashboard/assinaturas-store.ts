// src/modules/dashboard/assinaturas-store.ts
// Central de Assinaturas (fatia 1): situação derivada pra tela, novo
// vencimento ao pagar, e acesso a banco (service-role; RLS nega tenants).
// Régua do Junior: vencendo = faltam ≤8 dias (dia do 1º aviso automático).

// Cobrança recorrente (28/09/2026, migration 146): + 'pausada' (não gera fatura).
export type StatusAssinatura = 'ativa' | 'pausada' | 'travada' | 'cancelada';
export type Situacao = 'ativa' | 'vencendo' | 'vencida' | 'pausada' | 'travada' | 'cancelada';

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
  companyId: string | null;
  // Cobrança recorrente (146). Opcionais só pra não quebrar quem monta a linha
  // na mão (testes/fixtures); o banco sempre devolve.
  descricao?: string | null;
  documento?: string | null;
  diaVencimento?: number | null;
  inicioEm?: string | null;
  observacao?: string | null;
  leadId?: string | null;
  donaCompanyId?: string;
  // Pausa da assistente do tenant por fatura em aberto (146)
  pausaAutomatica?: boolean;
  diasPausa?: number;
  pausaAdiadaAte?: string | null;
  assistentePausadaEm?: string | null;
}

const CAMPOS = 'id, produto_id, nome, email, telefone, zap_confirmado, valor_centavos, limite, vence_em, status, company_id, descricao, documento, dia_vencimento, inicio_em, observacao, lead_id, dona_company_id, pausa_automatica, dias_pausa, pausa_adiada_ate, assistente_pausada_em, assinatura_produtos(nome)';

function paraRow(r: any): AssinaturaRow {
  return {
    id: r.id, produtoId: r.produto_id, produtoNome: r.assinatura_produtos?.nome ?? r.produto_id,
    nome: r.nome, email: r.email, telefone: r.telefone, zapConfirmado: r.zap_confirmado,
    valorCentavos: r.valor_centavos, limite: r.limite, venceEm: r.vence_em, status: r.status,
    companyId: r.company_id ?? null,
    descricao: r.descricao ?? null, documento: r.documento ?? null,
    diaVencimento: r.dia_vencimento ?? null, inicioEm: r.inicio_em ?? null,
    observacao: r.observacao ?? null, leadId: r.lead_id ?? null,
    donaCompanyId: r.dona_company_id ?? undefined,
    pausaAutomatica: r.pausa_automatica ?? true, diasPausa: r.dias_pausa ?? 3,
    pausaAdiadaAte: r.pausa_adiada_ate ?? null, assistentePausadaEm: r.assistente_pausada_em ?? null,
  };
}

/** Descrição que o cliente vê (a da assinatura; senão o nome do produto). */
export function descricaoDaAssinatura(a: Pick<AssinaturaRow, 'descricao' | 'produtoNome'>): string {
  return (a.descricao ?? '').trim() || a.produtoNome;
}

/** Assinaturas da empresa DONA (a casa). Sem dona → todas (legado/testes). */
export async function listarAssinaturas(client: SupabaseClient, donaId?: string): Promise<AssinaturaRow[]> {
  let q = client.from('assinaturas').select(CAMPOS);
  if (donaId) q = q.eq('dona_company_id', donaId);
  const { data, error } = await q.order('vence_em', { ascending: true });
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
  // cobrança recorrente (146)
  descricao?: string | null; documento?: string | null; diaVencimento?: number | null;
  inicioEm?: string | null; observacao?: string | null; donaId?: string;
}): Promise<string> {
  const row: Record<string, unknown> = {
    produto_id: d.produtoId, nome: d.nome, email: d.email ?? null, telefone: d.telefone ?? null,
    valor_centavos: d.valorCentavos, limite: d.limite ?? null, vence_em: d.venceEm,
    company_id: d.companyId ?? null, lead_id: d.leadId ?? null,
  };
  if (d.diaVencimento !== undefined) {
    Object.assign(row, {
      descricao: d.descricao ?? null, documento: d.documento ?? null, dia_vencimento: d.diaVencimento,
      inicio_em: d.inicioEm ?? null, observacao: d.observacao ?? null,
    });
  }
  if (d.donaId) row.dona_company_id = d.donaId;
  const { data, error } = await client.from('assinaturas').insert(row).select('id').single();
  if (error) throw new Error(`criarAssinatura: ${error.message}`);
  return (data as { id: string }).id;
}

export async function getAssinatura(client: SupabaseClient, id: string): Promise<AssinaturaRow | null> {
  const { data } = await client.from('assinaturas').select(CAMPOS).eq('id', id).maybeSingle();
  return data ? paraRow(data) : null;
}

/** A assinatura SÓ se for desta dona (rotas da casa: o id da URL nunca vale sozinho). */
export async function getAssinaturaDaDona(client: SupabaseClient, donaId: string, id: string): Promise<AssinaturaRow | null> {
  const { data } = await client.from('assinaturas').select(CAMPOS).eq('dona_company_id', donaId).eq('id', id).maybeSingle();
  return data ? paraRow(data) : null;
}

export async function editarAssinatura(client: SupabaseClient, id: string, campos: {
  valorCentavos?: number; telefone?: string | null; limite?: number | null; venceEm?: string; zapConfirmado?: boolean;
  nome?: string; email?: string | null; descricao?: string | null; documento?: string | null;
  diaVencimento?: number; observacao?: string | null;
  pausaAutomatica?: boolean; diasPausa?: number; pausaAdiadaAte?: string | null;
}, donaId?: string): Promise<void> {
  const row: Record<string, unknown> = {};
  if (campos.valorCentavos !== undefined) row.valor_centavos = campos.valorCentavos;
  if (campos.telefone !== undefined) row.telefone = campos.telefone;
  if (campos.limite !== undefined) row.limite = campos.limite;
  if (campos.venceEm !== undefined) row.vence_em = campos.venceEm;
  if (campos.zapConfirmado !== undefined) row.zap_confirmado = campos.zapConfirmado;
  if (campos.nome !== undefined) row.nome = campos.nome;
  if (campos.email !== undefined) row.email = campos.email;
  if (campos.descricao !== undefined) row.descricao = campos.descricao;
  if (campos.documento !== undefined) row.documento = campos.documento;
  if (campos.diaVencimento !== undefined) row.dia_vencimento = campos.diaVencimento;
  if (campos.observacao !== undefined) row.observacao = campos.observacao;
  if (campos.pausaAutomatica !== undefined) row.pausa_automatica = campos.pausaAutomatica;
  if (campos.diasPausa !== undefined) row.dias_pausa = campos.diasPausa;
  if (campos.pausaAdiadaAte !== undefined) row.pausa_adiada_ate = campos.pausaAdiadaAte;
  if (Object.keys(row).length === 0) return;
  let q = client.from('assinaturas').update(row).eq('id', id);
  if (donaId) q = q.eq('dona_company_id', donaId);
  const { error } = await q;
  if (error) throw new Error(`editarAssinatura: ${error.message}`);
}

export async function setStatusAssinatura(client: SupabaseClient, id: string, status: StatusAssinatura, donaId?: string): Promise<void> {
  let q = client.from('assinaturas').update({ status }).eq('id', id);
  if (donaId) q = q.eq('dona_company_id', donaId);
  const { error } = await q;
  if (error) throw new Error(`setStatusAssinatura: ${error.message}`);
}

/** Empresas (tenants) ativas pro select do form — id + nome, só isso. */
export async function listarEmpresasSimples(client: SupabaseClient): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await client.from('companies').select('id, nome').eq('ativo', true).order('nome');
  if (error) throw new Error(`listarEmpresasSimples: ${error.message}`);
  return (data ?? []).map((c: any) => ({ id: c.id, nome: c.nome }));
}

/** A assinatura (ativa, pausada ou travada) da empresa — "Minha assinatura" do tenant. */
export async function assinaturaDaEmpresa(client: SupabaseClient, companyId: string): Promise<AssinaturaRow | null> {
  if (!companyId) return null;
  const { data } = await client.from('assinaturas').select(CAMPOS)
    .eq('company_id', companyId)
    .in('status', ['ativa', 'pausada', 'travada'])
    .order('criado_em', { ascending: false })
    .limit(1);
  const r = (data as any[] | null)?.[0];
  return r ? paraRow(r) : null;
}

// ---- Limite do plano (fatia 3b — trava das 110 usinas) ----

/** Assinatura de monitoramento COM limite da empresa (null = sem trava).
 *  Vale ativa OU travada (travada continua contando o plano; cancelada não). */
export async function infoLimiteMonitoramento(
  client: SupabaseClient,
  companyId: string,
): Promise<{ assinaturaId: string; limite: number; nome: string } | null> {
  const { data } = await client.from('assinaturas')
    .select('id, limite, nome')
    .eq('produto_id', 'monitoramento')
    .eq('company_id', companyId)
    .in('status', ['ativa', 'travada'])
    .not('limite', 'is', null)
    .limit(1);
  const r = (data as { id: string; limite: number; nome: string }[] | null)?.[0];
  return r ? { assinaturaId: r.id, limite: r.limite, nome: r.nome } : null;
}

/** Quantas usinas ativas a empresa tem (uso do plano). */
export async function contarUsinasAtivas(client: SupabaseClient, companyId: string): Promise<number> {
  const { count, error } = await client.from('sistemas_clientes')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('ativo', true);
  if (error) throw new Error(`contarUsinasAtivas: ${error.message}`);
  return count ?? 0;
}

// (28/09/2026) O motor antigo (avisos 8d/2d + trava automática, fatia 2) deu
// lugar à cobrança recorrente por FATURA (src/modules/cobranca-recorrente/).
// A tabela assinatura_avisos (091) fica só como histórico.

/** Assinaturas que geram fatura (ativa ou com acesso suspenso), com dia e início. */
export async function listarCobraveis(client: SupabaseClient, donaId: string): Promise<AssinaturaRow[]> {
  const { data, error } = await client.from('assinaturas').select(CAMPOS)
    .eq('dona_company_id', donaId).in('status', ['ativa', 'travada'])
    .not('dia_vencimento', 'is', null);
  if (error) throw new Error(`listarCobraveis: ${error.message}`);
  return (data ?? []).map(paraRow);
}

/** Link da cobrança PENDENTE mais recente da assinatura (null se não tem). */
export async function linkPendente(client: SupabaseClient, assinaturaId: string): Promise<string | null> {
  const { data } = await client.from('cobrancas').select('link_url')
    .eq('assinatura_id', assinaturaId).eq('status', 'pendente')
    .order('criado_em', { ascending: false }).limit(1);
  const url = (data as { link_url: string | null }[] | null)?.[0]?.link_url;
  return url ?? null;
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

/**
 * Fatura paga (cobrança recorrente): o vencimento mostrado anda pro próximo
 * ciclo (nunca volta) e, se o acesso estava SUSPENSO, volta pra ativa.
 * Pausada/cancelada continuam como estão. true = destravou agora.
 */
export async function registrarPagamentoNaAssinatura(client: SupabaseClient, id: string, proximoVenceEm: string | null, podeDestravar = true): Promise<boolean> {
  const { data } = await client.from('assinaturas').select('vence_em, status').eq('id', id).maybeSingle();
  if (!data) return false;
  const atual = data as { vence_em: string; status: StatusAssinatura };
  const row: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (proximoVenceEm && proximoVenceEm > atual.vence_em) row.vence_em = proximoVenceEm;
  const destravar = atual.status === 'travada' && podeDestravar;
  if (destravar) row.status = 'ativa';
  const { error } = await client.from('assinaturas').update(row).eq('id', id);
  if (error) throw new Error(`registrarPagamentoNaAssinatura: ${error.message}`);
  return destravar;
}

// ---- Pausa da assistente do tenant por fatura em aberto (146) ----
// O campo é da ASSINATURA; quem pergunta "está pausada?" a cada mensagem é o
// consumer da fila (index.ts) via pausa.ts (cache de 60 s). A casa nunca.

/** Pausa SÓ se estava atendendo (update condicional — idempotente). Nunca a casa nem avulso. */
export async function pausarAssistenteNoBanco(client: SupabaseClient, id: string, casaId: string): Promise<boolean> {
  const agora = new Date().toISOString();
  const { data, error } = await client.from('assinaturas')
    .update({ assistente_pausada_em: agora, atualizado_em: agora })
    .eq('id', id).is('assistente_pausada_em', null).neq('company_id', casaId).not('company_id', 'is', null)
    .select('id');
  if (error) throw new Error(`pausarAssistenteNoBanco: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Reativa SÓ se estava pausada (update condicional — idempotente). */
export async function reativarAssistenteNoBanco(client: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await client.from('assinaturas')
    .update({ assistente_pausada_em: null, atualizado_em: new Date().toISOString() })
    .eq('id', id).not('assistente_pausada_em', 'is', null)
    .select('id');
  if (error) throw new Error(`reativarAssistenteNoBanco: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** A assistente desta empresa (tenant) está pausada por fatura? (banner do painel + consumer da fila) */
export async function pausaDaEmpresa(client: SupabaseClient, companyId: string): Promise<{ pausada: boolean; assinaturaId: string | null }> {
  if (!companyId) return { pausada: false, assinaturaId: null };
  const { data, error } = await client.from('assinaturas').select('id')
    .eq('company_id', companyId).not('assistente_pausada_em', 'is', null).limit(1);
  if (error) throw new Error(`pausaDaEmpresa: ${error.message}`);
  const id = (data as { id: string }[] | null)?.[0]?.id ?? null;
  return { pausada: !!id, assinaturaId: id };
}
