// src/modules/vendas/lojas/solfacil-client.ts
// Client HTTP da Sol Fácil: token Keycloak (senha) → GraphQL getSpareProducts
// paginado por categoria → ItemLoja[]. `fetchFn` injetável. Segredos em env
// (SOLFACIL_USER / SOLFACIL_PASS). Preço usado = Pix (embutido em payment_conditions).
import type { ItemLoja } from './tipos.js';
import { normalizarSolfacil } from './solfacil-normalize.js';

const SSO = 'https://sso.solfacil.com.br/realms/General/protocol/openid-connect/token';
const GRAPHQL = 'https://kong.solfacil.com.br/prd-bff-store/api/graphql';
const CLIENT_ID = 'ecommerce';
const REGION = 'DF';
const ZIPCODE = '71993150';

/** Categorias da loja que interessam pra tabela viva. */
export const CATEGORIAS_SOLFACIL = ['MODULES', 'INVERTERS', 'BATTERIES', 'STRUCTURES', 'CABLES'] as const;

const QUERY = `query getSpareProducts($description: String!, $page: Int!, $size: Int!, $category: String!, $region: String!, $channel: String!, $zipcode: String) {
  getSpareProducts(description: $description, page: $page, size: $size, category: $category, region: $region, channel: $channel, zipcode: $zipcode) {
    meta { page size count }
    products { sku manufacturer model description price info { title value } datasheet payment_conditions { payment_name discount_percent final_price } }
  }
}`;

export type FetchFn = typeof fetch;
export interface SolfacilCreds { usuario: string; senha: string; }

/** Token de acesso via password grant (Keycloak realm General, client ecommerce). */
export async function tokenSolfacil(creds: SolfacilCreds, fetchFn: FetchFn = fetch): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password', client_id: CLIENT_ID, username: creds.usuario, password: creds.senha,
  });
  const res = await fetchFn(SSO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Sol Fácil token HTTP ${res.status}`);
  const j = await res.json();
  const tok = j?.access_token;
  if (!tok) throw new Error('Sol Fácil: access_token não veio');
  return tok;
}

/** Puxa TODAS as páginas de uma categoria. */
export async function categoriaSolfacilRaw(
  token: string, category: string, fetchFn: FetchFn = fetch, size = 50,
): Promise<any[]> {
  const out: any[] = [];
  let page = 1, count = Infinity;
  while (out.length < count && page <= 100) {
    const res = await fetchFn(GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        operationName: 'getSpareProducts',
        variables: { description: '', category, channel: 'autoservico', page, size, region: REGION, zipcode: ZIPCODE },
        query: QUERY,
      }),
    });
    if (!res.ok) throw new Error(`Sol Fácil ${category} p${page} HTTP ${res.status}`);
    const j = await res.json();
    const d = j?.data?.getSpareProducts;
    if (!d) break;
    count = d.meta?.count ?? out.length;
    const prods = d.products ?? [];
    out.push(...prods);
    if (!prods.length) break;
    page++;
  }
  return out;
}

/** Token + varre categorias → ItemLoja[]. Categoria que falhar não derruba o resto. */
export async function puxarCatalogoSolfacil(creds: SolfacilCreds, fetchFn: FetchFn = fetch): Promise<ItemLoja[]> {
  const token = await tokenSolfacil(creds, fetchFn);
  const itens: ItemLoja[] = [];
  for (const cat of CATEGORIAS_SOLFACIL) {
    try {
      const prods = await categoriaSolfacilRaw(token, cat, fetchFn);
      itens.push(...normalizarSolfacil(prods, cat));
    } catch (e) {
      console.error('[solfacil] categoria', cat, 'falhou:', e instanceof Error ? e.message : e);
    }
  }
  return itens;
}
