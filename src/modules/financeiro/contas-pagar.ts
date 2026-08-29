// src/modules/financeiro/contas-pagar.ts
// Repo de contas a pagar e dívidas. Parcelas de dívida viram contas do mês (idempotente).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContaAberta } from './alertas-vencimento.js';

// Contas em aberto, ordenadas por vencimento; `ateIso` filtra até uma data (ex.: fila de alertas do dia).
export async function getContasAbertas(client: SupabaseClient, ateIso?: string): Promise<ContaAberta[]> {
  let q = client.from('financeiro_contas_a_pagar')
    .select('id, descricao, valor, vencimento, mundo, lembretes')
    .eq('status', 'aberta')
    .order('vencimento');
  if (ateIso) q = q.lte('vencimento', ateIso);
  const { data, error } = await q;
  if (error) throw new Error(`getContasAbertas: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string, descricao: r.descricao as string, valor: Number(r.valor),
    vencimento: r.vencimento as string, mundo: r.mundo as 'PJ' | 'PF',
    lembretes: (r.lembretes as Array<{ tipo: string; em: string }>) ?? [],
  }));
}

// Registra que um lembrete (3d/hoje/atraso) já foi enviado hoje, pra alertasDoDia não repetir.
// Lê-e-grava sem lock: assume escritor único (o cron diário de alertas), não uso concorrente.
export async function registrarLembrete(client: SupabaseClient, contaId: string, tipo: string, emIso: string): Promise<void> {
  const { data, error } = await client.from('financeiro_contas_a_pagar').select('lembretes').eq('id', contaId).single();
  if (error) throw new Error(`registrarLembrete: ${error.message}`);
  const lembretes = ((data as { lembretes: Array<{ tipo: string; em: string }> } | null)?.lembretes ?? []).concat({ tipo, em: emIso });
  const { error: err2 } = await client.from('financeiro_contas_a_pagar')
    .update({ lembretes, updated_at: new Date().toISOString() }).eq('id', contaId);
  if (err2) throw new Error(`registrarLembrete: ${err2.message}`);
}

// Marca paga com CAS em status='aberta' — clique duplo (dois cliques no mesmo dia) não paga duas vezes.
export async function marcarPaga(client: SupabaseClient, contaId: string, pagoEmIso: string, lancamentoId: string | null): Promise<boolean> {
  const { data, error } = await client.from('financeiro_contas_a_pagar')
    .update({ status: 'paga', pago_em: pagoEmIso, lancamento_id: lancamentoId, updated_at: new Date().toISOString() })
    .eq('id', contaId).eq('status', 'aberta').select('id');
  if (error) throw new Error(`marcarPaga: ${error.message}`);
  return (data ?? []).length === 1;
}

export async function criarContaPagar(client: SupabaseClient, c: {
  descricao: string; valor: number; vencimento: string; mundo: 'PJ' | 'PF'; categoriaSlug: string;
  origem?: 'manual' | 'divida' | 'fatura' | 'guia' | 'seed'; dividaId?: string | null;
}): Promise<string> {
  const { data, error } = await client.from('financeiro_contas_a_pagar').insert({
    descricao: c.descricao, valor: c.valor, vencimento: c.vencimento, mundo: c.mundo,
    categoria_slug: c.categoriaSlug, origem: c.origem ?? 'manual', divida_id: c.dividaId ?? null,
  }).select('id').single();
  if (error) throw new Error(`criarContaPagar: ${error.message}`);
  return (data as { id: string }).id;
}

// PURO: vencimento da parcela dentro da competência (AAAA-MM); dia inexistente no mês (ex.: 31 em setembro) clampa pro último dia.
export function vencimentoNoMes(competencia: string, dia: number): string {
  const [ano, mes] = competencia.split('-').map(Number);
  // `mes` (1-based, ex.: 9 = setembro) vira o mês 0-based SEGUINTE em Date.UTC; dia 0 desse mês "seguinte"
  // é o último dia do mês 1-based original — truque padrão pra achar o fim do mês sem tabela de dias.
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const d = Math.min(dia, ultimoDia);
  return `${competencia}-${String(d).padStart(2, '0')}`;
}

// Gera as contas a pagar do mês a partir das dívidas ativas — idempotente (pula dívida que já tem conta no mês).
export async function gerarParcelasDoMes(client: SupabaseClient, competencia: string): Promise<number> {
  const { data: dividas, error } = await client.from('financeiro_dividas').select('*').eq('ativa', true);
  if (error) throw new Error(`gerarParcelasDoMes: ${error.message}`);
  // fimMes precisa ser uma data REAL (30/09, não 31/09) — senão o Postgres rejeita o filtro lte('vencimento', ...).
  const inicioMes = `${competencia}-01`, fimMes = vencimentoNoMes(competencia, 31);
  let criadas = 0;
  for (const d of (dividas ?? []) as Array<Record<string, unknown>>) {
    const venc = vencimentoNoMes(competencia, d.dia_vencimento as number);
    if (d.ultima_parcela && venc > (d.ultima_parcela as string)) continue; // já quitada antes desta competência
    const { data: existentes, error: errEx } = await client.from('financeiro_contas_a_pagar')
      .select('id').eq('divida_id', d.id).gte('vencimento', inicioMes).lte('vencimento', fimMes).limit(1);
    if (errEx) throw new Error(`gerarParcelasDoMes: ${errEx.message}`);
    if ((existentes ?? []).length > 0) continue; // idempotente: já gerou a conta deste mês
    await criarContaPagar(client, {
      descricao: `${d.credor} — parcela`, valor: Number(d.parcela), vencimento: venc,
      mundo: d.mundo as 'PJ' | 'PF', categoriaSlug: 'outros', origem: 'divida', dividaId: d.id as string,
    });
    criadas++;
  }
  return criadas;
}
