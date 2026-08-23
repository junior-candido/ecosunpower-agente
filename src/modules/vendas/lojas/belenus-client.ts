// src/modules/vendas/lojas/belenus-client.ts
// Client HTTP da Belenus: login PJ (email+senha) → JWT → vitrine por família →
// ItemLoja[]. `fetchFn` injetável pra testar sem rede/segredo. Segredos em env
// (BELENUS_USER / BELENUS_PASS), nunca hardcode.
import type { CategoriaLoja, ItemLoja } from './tipos.js';
import { normalizarBelenus, type FamiliaBelenus } from './belenus-normalize.js';

const BASE = 'https://belenus.com.br';
const SITE_ID = '0001'; // site de preço (o UF/armazém é outro código; preço é igual entre regiões)

/** Famílias da Energia Solar (24/08) → categoria normalizada. */
export const FAMILIAS_BELENUS: { familia: number; categoria: CategoriaLoja }[] = [
  { familia: 2431, categoria: 'modulo' },
  { familia: 2623, categoria: 'micro' },
  { familia: 2644, categoria: 'inversor_string' },   // string mono 220V
  { familia: 2620, categoria: 'inversor_string' },   // tri 220V
  { familia: 2621, categoria: 'inversor_string' },   // tri 380V
  { familia: 2622, categoria: 'inversor_string' },   // tri 800V
  { familia: 2624, categoria: 'inversor_hibrido' },  // híbrido mono
  { familia: 2625, categoria: 'inversor_hibrido' },  // híbrido bifásico
  { familia: 2626, categoria: 'inversor_hibrido' },  // híbrido tri220
  { familia: 2627, categoria: 'inversor_hibrido' },  // híbrido tri380
  { familia: 2465, categoria: 'estrutura' },         // fixação
  { familia: 2466, categoria: 'componente' },        // componentes (cabos, DPS, string box, bateria...)
];

export type FetchFn = typeof fetch;
export interface BelenusCreds { email: string; senha: string; }

// A Belenus fica atrás de WAF/nginx e devolve 403 pra requisição "de servidor"
// sem cara de navegador. Estes headers imitam o Chrome (foi como funcionou na
// sessão do Junior) — User-Agent/Origin/Referer são o que costuma destravar.
const HEADERS_NAVEGADOR: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  Origin: BASE,
  Referer: `${BASE}/`,
};

/** Acha o primeiro JWT (x.y.z) dentro de um objeto de sessão. */
function acharJwt(o: unknown): string | null {
  if (typeof o === 'string') return o.split('.').length === 3 && o.length > 100 ? o : null;
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) {
      const r = acharJwt(v);
      if (r) return r;
    }
  }
  return null;
}

/** Faz login PJ por email e devolve o token (JWT). Lança em falha. */
export async function loginBelenus(creds: BelenusCreds, fetchFn: FetchFn = fetch): Promise<string> {
  const res = await fetchFn(`${BASE}/api/autenticacao/Usuario/Login/PessoaJuridicaByEmail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...HEADERS_NAVEGADOR },
    body: JSON.stringify({ email: creds.email, senha: creds.senha }),
  });
  if (!res.ok) throw new Error(`Belenus login HTTP ${res.status}`);
  const data = await res.json();
  const token = (data && typeof data === 'object' && 'token' in data ? (data as any).token : null) || acharJwt(data);
  if (!token) throw new Error('Belenus login: token não veio na resposta');
  return token;
}

/** Puxa uma família (vitrine) e devolve os `produtos` crus. */
export async function vitrineBelenus(token: string, familia: number, fetchFn: FetchFn = fetch): Promise<any[]> {
  const res = await fetchFn(`${BASE}/api/catalogo/catalogo/vitrine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}`, ...HEADERS_NAVEGADOR },
    body: JSON.stringify({ siteId: SITE_ID, familia, filtros: [], skip: 1, take: 300, order: 0 }),
  });
  if (!res.ok) throw new Error(`Belenus vitrine ${familia} HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j?.produtos) ? j.produtos : [];
}

/** Login + varre todas as famílias → ItemLoja[]. Uma família que falhar não derruba o resto. */
export async function puxarCatalogoBelenus(creds: BelenusCreds, fetchFn: FetchFn = fetch): Promise<ItemLoja[]> {
  const token = await loginBelenus(creds, fetchFn);
  const familias: FamiliaBelenus[] = [];
  for (const { familia, categoria } of FAMILIAS_BELENUS) {
    try {
      const produtos = await vitrineBelenus(token, familia, fetchFn);
      familias.push({ categoria, produtos });
    } catch (e) {
      console.error('[belenus] família', familia, 'falhou:', e instanceof Error ? e.message : e);
    }
  }
  return normalizarBelenus(familias);
}
