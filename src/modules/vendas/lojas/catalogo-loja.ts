// src/modules/vendas/lojas/catalogo-loja.ts
// Store da tabela `catalogo_loja` — o catálogo RAW das 3 lojas (preço vivo).
// SEPARADO da `tabela_precos` (curada pelo Junior): aqui é referência/comparação,
// NÃO alimenta o precificador sozinho. Padrão da casa: company_id + RLS.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CategoriaLoja, FonteLoja, ItemLoja } from './tipos.js';

export type ResultadoEscrita = { ok: true; gravados: number } | { ok: false; erro: string };

export interface ItemCatalogo extends ItemLoja {
  atualizadoEmMs: number;
}

export interface CatalogoLojaDeps {
  client: SupabaseClient;
  companyId: string;
}

const linhaDe = (i: ItemLoja, companyId: string, agoraMs: number) => ({
  company_id: companyId,
  fonte: i.fonte,
  categoria: i.categoria,
  sku: i.sku,
  marca: i.marca,
  modelo: i.modelo,
  descricao: i.descricao,
  potencia_w: i.potenciaW,
  preco_unitario: i.precoUnitario,
  preco_cheio: i.precoCheio,
  rs_por_wp: i.rsPorWp,
  estoque: i.estoque,
  datasheet_url: i.datasheet,
  ativo: true,
  atualizado_em: new Date(agoraMs).toISOString(),
});

export class CatalogoLojaService {
  constructor(private readonly deps: CatalogoLojaDeps) {}

  /** Upsert de um lote (uma sincronização de uma loja) por (company_id, fonte, sku). */
  async upsertLote(itens: ItemLoja[], agoraMs: number): Promise<ResultadoEscrita> {
    if (!itens.length) return { ok: true, gravados: 0 };
    try {
      const linhas = itens.map((i) => linhaDe(i, this.deps.companyId, agoraMs));
      const { error } = await this.deps.client
        .from('catalogo_loja')
        .upsert(linhas, { onConflict: 'company_id,fonte,sku' });
      if (error) {
        console.error('[catalogo_loja] upsert falhou', error.message ?? error);
        return { ok: false, erro: error.message ?? 'banco' };
      }
      console.log(`[catalogo_loja] ${linhas.length} itens gravados (${itens[0]?.fonte})`);
      return { ok: true, gravados: linhas.length };
    } catch (e) {
      console.error('[catalogo_loja] upsert explodiu', e instanceof Error ? e.message : e);
      return { ok: false, erro: e instanceof Error ? e.message : 'banco' };
    }
  }

  /** Desativa itens de uma fonte que não vieram nesta sincronização (sumiram da loja). */
  async marcarSumidos(fonte: FonteLoja, skusVivos: string[], agoraMs: number): Promise<void> {
    try {
      let q = this.deps.client.from('catalogo_loja').update({ ativo: false, atualizado_em: new Date(agoraMs).toISOString() })
        .eq('company_id', this.deps.companyId).eq('fonte', fonte).eq('ativo', true);
      if (skusVivos.length) q = q.not('sku', 'in', `(${skusVivos.map((s) => JSON.stringify(s)).join(',')})`);
      const { error } = await q;
      if (error) console.error('[catalogo_loja] marcarSumidos falhou', error.message ?? error);
    } catch (e) {
      console.error('[catalogo_loja] marcarSumidos explodiu', e instanceof Error ? e.message : e);
    }
  }

  /** Lê os itens ativos (pro comparador). Opcionalmente filtra por categoria. */
  async listarAtivos(categoria?: CategoriaLoja): Promise<ItemCatalogo[]> {
    try {
      let q = this.deps.client.from('catalogo_loja')
        .select('fonte, categoria, sku, marca, modelo, descricao, potencia_w, preco_unitario, preco_cheio, rs_por_wp, estoque, datasheet_url, atualizado_em')
        .eq('company_id', this.deps.companyId).eq('ativo', true);
      if (categoria) q = q.eq('categoria', categoria);
      const { data, error } = await q;
      if (error) { console.error('[catalogo_loja] listar falhou', error.message ?? error); return []; }
      return (data ?? []).map((r: any): ItemCatalogo => ({
        fonte: r.fonte, categoria: r.categoria, sku: r.sku, marca: r.marca, modelo: r.modelo,
        descricao: r.descricao, potenciaW: r.potencia_w, precoUnitario: Number(r.preco_unitario),
        precoCheio: r.preco_cheio == null ? null : Number(r.preco_cheio), rsPorWp: r.rs_por_wp == null ? null : Number(r.rs_por_wp),
        estoque: r.estoque, datasheet: r.datasheet_url, atualizadoEmMs: new Date(r.atualizado_em).getTime(),
      }));
    } catch (e) {
      console.error('[catalogo_loja] listar explodiu', e instanceof Error ? e.message : e);
      return [];
    }
  }
}
