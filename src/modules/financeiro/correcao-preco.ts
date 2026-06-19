// src/modules/financeiro/correcao-preco.ts
// Correção tardia de preço de material já registrado ("a curva da Itaiaia era 8").
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseValorReais } from './comando-imposto.js';
import { normalizarMaterial } from './materiais.js';
import type { MsgComBotoes } from './resumo-lancamento.js';

export interface CorrecaoPreco { material: string; loja: string | null; valorNovo: number }

// PURO. Padrão: artigo + material [+ (da|do|na|no) loja] + (era|foi|custou|saiu por) + valor.
export function parseCorrecaoPrecoMaterial(text: string): CorrecaoPreco | null {
  const t = text.trim();
  // Com loja: "a <material> da <loja> era <valor>"
  let m = t.match(/^(?:o|a|os|as)\s+(.+?)\s+(?:da|do|na|no)\s+(.+?)\s+(?:era|foi|custou|saiu\s+por)\s+(.+)$/i);
  if (m) {
    const valorNovo = parseValorReais(m[3]);
    if (valorNovo === null) return null;
    return { material: m[1].trim(), loja: m[2].trim(), valorNovo };
  }
  // Sem loja: "a <material> era <valor>"
  m = t.match(/^(?:o|a|os|as)\s+(.+?)\s+(?:era|foi|custou|saiu\s+por)\s+(.+)$/i);
  if (m) {
    const valorNovo = parseValorReais(m[2]);
    if (valorNovo === null) return null;
    return { material: m[1].trim(), loja: null, valorNovo };
  }
  return null;
}

export interface CompraDetalhe { id: string; material: string; loja: string | null; preco_unitario: number; data_evento: string }

// I/O: busca compras que casam o material (e a loja, se citada), mais recentes primeiro.
export async function buscarComprasPorMaterial(client: SupabaseClient, c: CorrecaoPreco): Promise<CompraDetalhe[]> {
  const t = normalizarMaterial(c.material).replace(/[%_]/g, '\\$&');
  let q = client.from('financeiro_materiais_compras')
    .select('id, material, loja, preco_unitario, data_evento')
    .ilike('material_norm', `%${t}%`);
  if (c.loja) q = q.ilike('loja', `%${c.loja.replace(/[%_]/g, '\\$&')}%`);
  const { data, error } = await q.order('data_evento', { ascending: false }).order('created_at', { ascending: false }).limit(5);
  if (error) throw new Error(`buscarComprasPorMaterial: ${error.message}`);
  return (data ?? []) as CompraDetalhe[];
}

// PURO: pega a compra mais recente de cada loja (pra desambiguar por loja).
export function maisRecentePorLoja(rows: CompraDetalhe[]): CompraDetalhe[] {
  const vistos = new Set<string>();
  const out: CompraDetalhe[] = [];
  for (const r of rows) { // já vêm ordenadas por data desc
    const k = (r.loja ?? '—').toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k); out.push(r);
  }
  return out;
}

// Corrige o preço unitário e recalcula o valor_total (preço × quantidade da linha),
// pra não deixar o total inconsistente caso algum relatório futuro o leia.
export async function atualizarPrecoCompra(client: SupabaseClient, id: string, novoPreco: number): Promise<boolean> {
  const { data: atual } = await client.from('financeiro_materiais_compras')
    .select('quantidade').eq('id', id).maybeSingle();
  const quantidade = Number((atual as { quantidade?: number } | null)?.quantidade) || 1;
  const valorTotal = Math.round(novoPreco * quantidade * 100) / 100;
  const { data, error } = await client.from('financeiro_materiais_compras')
    .update({ preco_unitario: novoPreco, valor_total: valorTotal })
    .eq('id', id).select('id');
  if (error) throw new Error(`atualizarPrecoCompra: ${error.message}`);
  return Boolean(data && data.length > 0);
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const cents = (n: number) => Math.round(n * 100);

// Monta a confirmação. 1 alvo → pergunta direta. Vários → 1 botão por loja (até 3).
export function montarConfirmacaoCorrecao(alvos: CompraDetalhe[], valorNovo: number): MsgComBotoes | null {
  if (alvos.length === 0) return null;
  if (alvos.length === 1) {
    const a = alvos[0];
    return {
      body: `Achei *${a.material}* · ${a.loja ?? '—'} · ${dm(a.data_evento)} · ${brl(a.preco_unitario)} → mudo pra *${brl(valorNovo)}*?`,
      buttons: [
        { id: `matcorr:ok:${a.id}:${cents(valorNovo)}`, title: 'Sim, mudar' },
        { id: 'matcorr:no:0', title: 'Não' },
      ],
    };
  }
  return {
    body: `Achei em mais de uma loja — qual você quer mudar pra *${brl(valorNovo)}*?`,
    buttons: alvos.slice(0, 3).map((a) => ({ id: `matcorr:ok:${a.id}:${cents(valorNovo)}`, title: (a.loja ?? '—').slice(0, 20) })),
  };
}
