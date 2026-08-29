// src/modules/financeiro/favorecidos.ts
// Dicionário de favorecidos: quem é quem. PURO (casar) + repo (Supabase).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Favorecido {
  id: string;
  nome: string;
  doc_mascarado: string | null;
  padroes: string[];
  categoria_slug: string;
  mundo_padrao: 'PJ' | 'PF' | 'FRONTEIRA';
  tipo_padrao: 'despesa' | 'entrada' | null;
}

export function normalizarTexto(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// CNPJ pode vir "32.489.209 0001-57" (Sicoob) ou "32.489.209/0001-57": casa os dois pela raiz.
function variantesDoc(p: string): string[] {
  const out = new Set<string>([p]);
  if (/\d{2}\.\d{3}\.\d{3}[ /]\d{4}-\d{2}/.test(p)) out.add(p.replace(/[ /]\d{4}-\d{2}$/, ''));
  return [...out];
}

// Devolve o favorecido cujo padrão mais longo aparece no texto; null se nenhum.
export function casarFavorecido(texto: string, lista: Favorecido[]): Favorecido | null {
  const t = normalizarTexto(texto);
  let melhor: { fav: Favorecido; len: number } | null = null;
  for (const fav of lista) {
    for (const p of fav.padroes) {
      const pn = normalizarTexto(p);
      if (!pn) continue;
      for (const v of variantesDoc(pn)) {
        if (t.includes(v) && (!melhor || v.length > melhor.len)) melhor = { fav, len: v.length };
      }
    }
  }
  return melhor?.fav ?? null;
}

const COLS = 'id, nome, doc_mascarado, padroes, categoria_slug, mundo_padrao, tipo_padrao';

export async function getFavorecidos(client: SupabaseClient): Promise<Favorecido[]> {
  const { data, error } = await client.from('financeiro_favorecidos').select(COLS).order('nome');
  if (error) throw new Error(`getFavorecidos: ${error.message}`);
  return (data ?? []) as Favorecido[];
}

export async function aprenderFavorecido(client: SupabaseClient, f: {
  nome: string; doc_mascarado?: string | null; padroes: string[];
  categoria_slug: string; mundo_padrao: 'PJ' | 'PF' | 'FRONTEIRA'; tipo_padrao?: 'despesa' | 'entrada' | null;
}): Promise<string> {
  const { data, error } = await client.from('financeiro_favorecidos').insert({
    nome: f.nome, doc_mascarado: f.doc_mascarado ?? null,
    padroes: f.padroes.map(normalizarTexto).filter(Boolean),
    categoria_slug: f.categoria_slug, mundo_padrao: f.mundo_padrao, tipo_padrao: f.tipo_padrao ?? null,
  }).select('id').single();
  if (error) throw new Error(`aprenderFavorecido: ${error.message}`);
  return (data as { id: string }).id;
}
