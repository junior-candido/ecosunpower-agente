// Observabilidade do prompt caching (commit 71c8583). Uma linha [cache] por
// resposta do brain: quanto do input veio do cache (~0.1x preço) vs cobrado
// cheio. hit% = read / (read + write + uncached) — fração do input servida
// do cache. 1º request: write alto, hit ~0%. Requests seguintes: read alto.

export interface CacheUsage {
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export function formatCacheUsage(usage: CacheUsage | null | undefined): string {
  // Defensivo: esse log roda no caminho da resposta da Eva. Se usage vier
  // ausente/malformado, NUNCA pode lançar e derrubar a resposta.
  const u = usage ?? {};
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  const uncached = u.input_tokens ?? 0;
  const out = u.output_tokens ?? 0;

  const totalInput = read + write + uncached;
  const hitPct = totalInput > 0 ? (read / totalInput) * 100 : 0;

  return `[cache] read=${read} write=${write} uncached=${uncached} out=${out} — hit ${hitPct.toFixed(1)}%`;
}
