// Cache de token em memória, module-level, shared pelos adapters de
// monitoramento que renovam credenciais (Deye, NEP, e futuros).
//
// Antes: cada adapter mantinha seu próprio `Map<string, {token, exp}>` +
// função `cacheKey()` + constante `TOKEN_TTL_MS`. Como o padrão era idêntico,
// dois adapters podiam descolar (ex: Deye 6h, NEP 3h por engano) e qualquer
// melhoria (negative caching, métricas) exigia editar cada adapter.
//
// Decisão de design: NÃO persistir em Redis/DB. Tokens duram de horas a dias
// e o processo principal recicla a cada deploy (~1×/semana em prod). Cache em
// memória cobre 99% das chamadas dentro de um dia sem latência extra de I/O.
//
// Cada adapter calcula sua própria `key` (geralmente um hash das credenciais)
// e passa pra `getOrFetch`, que decide entre cache-hit ou chamar o `loader`.

export const DEFAULT_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6h

interface CachedToken { token: string; exp: number }

const store = new Map<string, CachedToken>();

export type TokenLoaderResult =
  | { ok: true; token: string }
  | { ok: false; reason: string; invalidCredentials?: boolean };

/**
 * Pega o token do cache (se válido) ou chama o loader pra emitir um novo.
 *
 * - `key`: chave única por credencial (adapter calcula hash das credenciais).
 * - `loader`: função que vai à API da marca e retorna o token cru.
 * - `ttlMs`: tempo de validade do cache (default 6h, conservador pra tokens
 *   que duram ≥30 dias na origem).
 * - `forceRefresh`: descarta cache atual e chama loader. Use quando uma chamada
 *   subsequente retornou 401 (token revogado dentro da janela de cache).
 */
export async function getOrFetch(
  key: string,
  loader: () => Promise<TokenLoaderResult>,
  ttlMs: number = DEFAULT_TOKEN_TTL_MS,
  forceRefresh = false,
): Promise<TokenLoaderResult> {
  if (forceRefresh) {
    store.delete(key);
  } else {
    const cached = store.get(key);
    if (cached && cached.exp > Date.now()) {
      return { ok: true, token: cached.token };
    }
  }

  const resolved = await loader();
  if (resolved.ok) {
    store.set(key, { token: resolved.token, exp: Date.now() + ttlMs });
  }
  return resolved;
}

/** Limpa o cache inteiro. Útil em testes. */
export function clearAllTokens(): void {
  store.clear();
}
