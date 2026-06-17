// src/modules/financeiro/materiais.ts
// Peça 4: comparar preço de material entre lojas. Roda em cima da Caixa de Entrada.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLancamento } from './lancamentos-repo.js';

export interface CompraRow { loja: string | null; preco_unitario: number; data_evento: string; }

// Normaliza o nome do material pra agrupar (lowercase, sem acento, espaços colapsados).
export function normalizarMaterial(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Detecta uma CONSULTA de preço de material e devolve o termo (ou null).
export function parseConsultaMaterial(text: string): string | null {
  let t = text.trim().replace(/\?+\s*$/, '').trim();
  const gatilho = /^(onde\s+(?:t[aá]|est[aá])\s+mais\s+barat[oa]|qual\s+(?:o\s+)?pre[cç]o|pre[cç]o|quanto\s+custa|valor)\b/i;
  if (!gatilho.test(t)) return null;
  t = t.replace(gatilho, '').trim();
  t = t.replace(/^d[eo]s?\s+/i, '').replace(/^d[ao]s?\s+/i, '').trim(); // de/do/das/da
  t = t.replace(/^(?:o|a|os|as)\s+/i, '').trim();                       // artigo
  return t.length >= 2 ? t : null;
}

export function precoUnitario(valorTotal: number, quantidade: number | null): number {
  const q = quantidade && quantidade > 0 ? quantidade : 1;
  return Math.round((valorTotal / q) * 100) / 100;
}

// Por loja: pega a compra MAIS RECENTE (preço que vale hoje); ordena por preço asc.
export function rankearLojas(rows: CompraRow[]): Array<{ loja: string; preco_unitario: number; data_evento: string }> {
  const porLoja = new Map<string, { loja: string; preco_unitario: number; data_evento: string }>();
  for (const r of rows) {
    const loja = r.loja ?? '—';
    const atual = porLoja.get(loja.toLowerCase());
    if (!atual || r.data_evento > atual.data_evento) {
      porLoja.set(loja.toLowerCase(), { loja, preco_unitario: Number(r.preco_unitario), data_evento: r.data_evento });
    }
  }
  return [...porLoja.values()].sort((a, b) => a.preco_unitario - b.preco_unitario);
}

export function formatarRanking(termo: string, ranking: Array<{ loja: string; preco_unitario: number; data_evento: string }>): string {
  if (ranking.length === 0) return `Ainda não tenho preço de *${termo}* registrado. Compra uma vez que eu já guardo. 👍`;
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dm = (iso: string) => { const p = iso.slice(0, 10).split('-'); return `${p[2]}/${p[1]}`; };
  const linhas = ranking.map((r, i) => `${i + 1}º  ${r.loja} — ${brl(r.preco_unitario)} (${dm(r.data_evento)})`);
  return `💰 *${termo}* — onde tá mais barato:\n${linhas.join('\n')}`;
}

// --- I/O ---
export async function inserirCompraMaterial(client: SupabaseClient, c: {
  lancamento_id: string; material: string; material_norm: string; loja: string | null;
  quantidade: number; unidade: string; valor_total: number; preco_unitario: number; data_evento: string;
}): Promise<void> {
  const { error } = await client.from('financeiro_materiais_compras').insert(c);
  if (error) throw new Error(`inserirCompraMaterial: ${error.message}`);
}

export async function getComprasPorMaterialNorm(client: SupabaseClient, termoNorm: string): Promise<CompraRow[]> {
  const t = termoNorm.replace(/[%_]/g, '\\$&');
  const { data, error } = await client.from('financeiro_materiais_compras')
    .select('loja, preco_unitario, data_evento')
    .ilike('material_norm', `%${t}%`)
    .order('data_evento', { ascending: false }).limit(200);
  if (error) throw new Error(`getComprasPorMaterialNorm: ${error.message}`);
  return (data ?? []) as CompraRow[];
}

// --- Orquestração ---
// Grava a compra de material a partir de um lançamento JÁ confirmado. Retorna true se gravou.
export async function gravarCompraMaterialSeHouver(client: SupabaseClient, lancamentoId: string): Promise<boolean> {
  const row = await getLancamento(client, lancamentoId);
  if (!row || row.status !== 'confirmado' || row.tipo !== 'despesa') return false;
  const ex = (row.extracao ?? {}) as Record<string, unknown>;
  const material = typeof ex.material === 'string' && ex.material.trim() ? ex.material.trim() : null;
  if (!material) return false;
  const quantidade = typeof ex.quantidade === 'number' && ex.quantidade > 0 ? ex.quantidade : 1;
  const unidade = typeof ex.unidade === 'string' && ex.unidade.trim() ? ex.unidade.trim() : 'un';
  const valorTotal = Number(row.valor);
  await inserirCompraMaterial(client, {
    lancamento_id: lancamentoId, material, material_norm: normalizarMaterial(material),
    loja: row.contraparte ?? null, quantidade, unidade,
    valor_total: valorTotal, preco_unitario: precoUnitario(valorTotal, quantidade),
    data_evento: row.data_evento,
  });
  return true;
}

export async function montarRankingMaterial(client: SupabaseClient, termo: string): Promise<string> {
  const rows = await getComprasPorMaterialNorm(client, normalizarMaterial(termo));
  return formatarRanking(termo, rankearLojas(rows));
}

// Handler no formato dos comandos do index: (from, text) => Promise<boolean>.
export function makeMaterialQueryHandler(
  client: SupabaseClient,
  isAdminPhone: (p: string) => boolean,
  sendText: (to: string, body: string) => Promise<unknown>,
) {
  return async function tryHandleConsultaMaterial(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const termo = parseConsultaMaterial(text);
    if (!termo) return false;
    await sendText(from, await montarRankingMaterial(client, termo));
    return true;
  };
}
