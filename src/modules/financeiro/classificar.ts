// src/modules/financeiro/classificar.ts
// PURO: decide categoria, mundo (PJ/PF/FRONTEIRA) e confiança. Regra: dicionário
// confirmado > extração explícita > padrão PJ com confiança baixa. Nunca bloqueia.
import { casarFavorecido, type Favorecido } from './favorecidos.js';
import { resolverCategoria, type CategoriaSlug } from './lancamentos.js';

export interface EntradaClassificar {
  tipo: 'despesa' | 'entrada' | null;
  valor: number | null;
  contraparte: string | null;
  categoria_slug: string | null;
  pf_pj: 'PF' | 'PJ' | null;
  descricao: string | null;
}
export interface Classificacao {
  categoria_slug: CategoriaSlug;
  mundo: 'PJ' | 'PF' | 'FRONTEIRA';
  confianca: 'alta' | 'media' | 'baixa';
  favorecido_id: string | null;
  favorecido_nome: string | null;
}

export function classificar(e: EntradaClassificar, dicionario: Favorecido[]): Classificacao {
  const texto = [e.contraparte, e.descricao].filter(Boolean).join(' ');
  const fav = texto ? casarFavorecido(texto, dicionario) : null;
  const catExplicita = e.categoria_slug && e.categoria_slug !== 'outros' ? resolverCategoria(e.categoria_slug) : null;
  const categoria_slug = catExplicita ?? (fav ? resolverCategoria(fav.categoria_slug) : resolverCategoria(e.categoria_slug));
  const mundo: Classificacao['mundo'] = e.pf_pj ?? fav?.mundo_padrao ?? 'PJ';
  const confianca: Classificacao['confianca'] = fav ? 'alta' : (e.pf_pj || catExplicita) ? 'media' : 'baixa';
  return { categoria_slug, mundo, confianca, favorecido_id: fav?.id ?? null, favorecido_nome: fav?.nome ?? null };
}
