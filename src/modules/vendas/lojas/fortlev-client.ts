// src/modules/vendas/lojas/fortlev-client.ts
// Client da Fortlev (fortlevsolar.app): lista HTMX paginada (GET /produto-avulso?
// pagina=N) → extrai o JSON do componente de cada card (addCart({...})) + preço →
// ItemLoja[]. `fetchFn` injetável. ATENÇÃO: a Fortlev exige LOGIN por sessão
// (cookie) — o login não é API pública; no servidor, obter o cookie via Playwright
// headless (ver plano). Aqui recebemos o cookie pronto.
import type { ItemLoja } from './tipos.js';
import { normalizarFortlev, type CardFortlev } from './fortlev-normalize.js';

const BASE = 'https://fortlevsolar.app';

export type FetchFn = typeof fetch;

/** Extrai os objetos `component` (de addCart({component:{...}})) balanceando chaves. */
export function extrairComponentes(html: string): any[] {
  const out: any[] = [];
  let idx = 0;
  while (true) {
    const i = html.indexOf('addCart(', idx);
    if (i < 0) break;
    const abre = html.indexOf('{', i);
    if (abre < 0) break;
    let depth = 0, k = abre;
    for (; k < html.length; k++) {
      if (html[k] === '{') depth++;
      else if (html[k] === '}') { depth--; if (depth === 0) { k++; break; } }
    }
    const bruto = html.slice(abre, k);
    try {
      const obj = JSON.parse(bruto);
      out.push(obj.component ?? obj);
    } catch { /* card malformado: pula */ }
    idx = k;
  }
  return out;
}

/** Extrai os textos de preço na ordem em que aparecem ("R$ 2.278,26"). */
export function extrairPrecos(html: string): string[] {
  const out: string[] = [];
  const re = /text-orders-price[\s\S]{0,200}?(R\$\s?[\d.]+,\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/** Junta componentes + preços (mesma ordem) numa página → CardFortlev[]. */
export function cardsDaPagina(html: string): CardFortlev[] {
  const comps = extrairComponentes(html);
  const precos = extrairPrecos(html);
  return comps.map((component, i) => ({ component, precoTexto: precos[i] ?? '' }));
}

/** Puxa todas as páginas usando o cookie de sessão → ItemLoja[]. */
export async function puxarCatalogoFortlev(cookie: string, fetchFn: FetchFn = fetch, maxPaginas = 40): Promise<ItemLoja[]> {
  const todos: CardFortlev[] = [];
  for (let p = 1; p <= maxPaginas; p++) {
    const res = await fetchFn(`${BASE}/produto-avulso?pagina=${p}`, {
      headers: { 'HX-Request': 'true', Cookie: cookie },
    });
    if (!res.ok) throw new Error(`Fortlev p${p} HTTP ${res.status}`);
    const html = await res.text();
    const cards = cardsDaPagina(html);
    if (!cards.length) break;
    todos.push(...cards);
  }
  return normalizarFortlev(todos);
}
