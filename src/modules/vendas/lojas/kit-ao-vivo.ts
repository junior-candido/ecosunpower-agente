// src/modules/vendas/lojas/kit-ao-vivo.ts
// Puxa o KIT REAL das lojas AO VIVO pro dashboard (server-side). Hoje: Sol Fácil.
// Cache curto do token Keycloak (evita relogar a cada request). Fortlev/Belenus entram
// aqui nas próximas fatias. Sem credenciais no ambiente → devolve [] (a tela avisa).
import { tokenSolfacil, type FetchFn } from './solfacil-client.js';
import { puxarKitsSolfacil, type ParamsKitSolfacil } from './solfacil-kit-client.js';
import type { KitOferta } from './kit-oferta.js';

interface CacheToken { token: string; expiraEmMs: number; }
let cacheSolfacil: CacheToken | null = null;
const TTL_TOKEN_MS = 4 * 60 * 1000; // 4 min — bem abaixo da validade real do token

/** Token da Sol Fácil com cache curto. `agoraMs`/`fetchFn` injetáveis p/ teste. */
export async function tokenSolfacilCacheado(
  creds: { usuario: string; senha: string },
  agoraMs: () => number = Date.now,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const agora = agoraMs();
  if (cacheSolfacil && cacheSolfacil.expiraEmMs > agora) return cacheSolfacil.token;
  const token = await tokenSolfacil(creds, fetchFn);
  cacheSolfacil = { token, expiraEmMs: agora + TTL_TOKEN_MS };
  return token;
}

/** Zera o cache (teste). */
export function _limparCacheToken(): void { cacheSolfacil = null; }

export interface CredsLojas {
  solfacil?: { usuario: string; senha: string };
}

/** Lê credenciais do ambiente (mesmo padrão do sync). */
export function credsLojasDoEnv(env: NodeJS.ProcessEnv = process.env): CredsLojas {
  const out: CredsLojas = {};
  if (env.SOLFACIL_USER && env.SOLFACIL_PASS) out.solfacil = { usuario: env.SOLFACIL_USER, senha: env.SOLFACIL_PASS };
  return out;
}

export interface ResultadoKitAoVivo {
  solfacil: KitOferta[];
  erros: string[];         // mensagens por loja que falhou (não derruba a tela)
  semCredencial: boolean;  // true se nenhuma loja tem login no ambiente
}

/** Puxa o kit real de todas as lojas com login. Uma loja que falhar não derruba as outras. */
export async function puxarKitReal(
  params: ParamsKitSolfacil,
  creds: CredsLojas = credsLojasDoEnv(),
  deps: { agoraMs?: () => number; fetchFn?: FetchFn } = {},
): Promise<ResultadoKitAoVivo> {
  const out: ResultadoKitAoVivo = { solfacil: [], erros: [], semCredencial: !creds.solfacil };
  if (creds.solfacil) {
    try {
      const token = await tokenSolfacilCacheado(creds.solfacil, deps.agoraMs, deps.fetchFn);
      out.solfacil = await puxarKitsSolfacil(token, params, deps.fetchFn);
    } catch (e) {
      out.erros.push('Sol Fácil: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
  return out;
}
