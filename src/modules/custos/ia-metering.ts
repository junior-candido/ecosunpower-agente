// Medidor de custo de IA (Claude). Cada chamada de modelo pode gravar 1 linha
// em custos_ia_uso com os tokens usados + o custo estimado em CENTAVOS DE REAL.
//
// A conta é feita aqui, no código, porque só aqui a gente tem os preços por
// modelo e a cotação do dólar do momento. O banco só guarda o número final.
//
// REGRA DE OURO: gravar custo é best-effort. Um erro aqui (banco fora, usage
// malformado, etc.) NUNCA pode derrubar a resposta da Eva/Elo. Tudo em try/catch.

// Preços oficiais Anthropic, em USD por MILHÃO de tokens (cache 2026-06-24).
// input = tokens de entrada "frescos"; output = tokens gerados.
// Cache é derivado do input do próprio modelo (não hardcode separado):
//   leitura do cache (cache hit)      = 0.10 × input
//   escrita no cache (janela de 5min) = 1.25 × input
interface PrecoModelo {
  input: number; // USD / 1M tokens
  output: number; // USD / 1M tokens
}

const PRECOS_USD_POR_MILHAO: Record<string, PrecoModelo> = {
  sonnet: { input: 3.0, output: 15.0 },
  haiku: { input: 1.0, output: 5.0 },
  opus: { input: 5.0, output: 25.0 },
};

// Fallback razoável quando o modelo não é reconhecido: preços do Sonnet (o
// modelo padrão da Eva). Nunca quebra — só estima com o preço do meio.
const PRECO_FALLBACK: PrecoModelo = PRECOS_USD_POR_MILHAO.sonnet;

// Multiplicadores de cache, derivados do input de cada modelo.
const MULT_CACHE_READ = 0.1; // leitura = 0.1 × input
const MULT_CACHE_WRITE = 1.25; // escrita (5min) = 1.25 × input

// Cotação aproximada — ajustar quando variar muito.
export const USD_BRL = 5.4;

// Usage no formato que a SDK da Anthropic devolve (response.usage). Campos
// aceitam null porque a SDK usa null quando não houve cache.
export interface IaUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

// Normaliza o nome do modelo (ex.: 'claude-haiku-4-5-20251001' → 'haiku') e
// devolve o preço. Modelo desconhecido → fallback (sonnet), sem quebrar.
function precoDoModelo(modelo: string): PrecoModelo {
  const m = String(modelo ?? '').toLowerCase();
  if (m.startsWith('claude-haiku-4-5') || m.includes('haiku')) return PRECOS_USD_POR_MILHAO.haiku;
  if (m.startsWith('claude-opus-4-8') || m.includes('opus')) return PRECOS_USD_POR_MILHAO.opus;
  if (m.startsWith('claude-sonnet-4-6') || m.includes('sonnet')) return PRECOS_USD_POR_MILHAO.sonnet;
  return PRECO_FALLBACK;
}

/**
 * Custo de uma chamada de IA em CENTAVOS DE BRL (inteiro, arredondado).
 *
 * Fórmula:
 *   usd   = (input*pIn + output*pOut + cacheRead*pCacheRead + cacheWrite*pCacheWrite) / 1_000_000
 *   cents = round(usd × USD_BRL × 100)
 * onde pCacheRead = 0.10 × pIn e pCacheWrite = 1.25 × pIn.
 */
export function custoCentsBRL(modelo: string, usage: IaUsage): number {
  const preco = precoDoModelo(modelo);
  const precoCacheRead = preco.input * MULT_CACHE_READ;
  const precoCacheWrite = preco.input * MULT_CACHE_WRITE;

  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  const usd =
    (input * preco.input +
      output * preco.output +
      cacheRead * precoCacheRead +
      cacheWrite * precoCacheWrite) /
    1_000_000;

  return Math.round(usd * USD_BRL * 100);
}

/**
 * Grava 1 linha em custos_ia_uso com os tokens + o custo estimado em centavos
 * de BRL. Best-effort: qualquer erro é engolido (log) e a função nunca lança.
 *
 * @param client Client Supabase (service role). Se null/undefined, não faz nada.
 */
export async function registrarUsoIa(
  client: any,
  args: { modelo: string; origem?: string; usage: IaUsage },
): Promise<void> {
  try {
    if (!client) return;
    const { modelo, origem, usage } = args;
    const custo_cents = custoCentsBRL(modelo, usage);
    await client.from('custos_ia_uso').insert({
      modelo,
      origem: origem ?? null,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      custo_cents,
    });
  } catch (err) {
    // Best-effort: medir custo nunca pode derrubar o fluxo da IA.
    console.error('[custos] registrarUsoIa falhou (best-effort):', (err as Error)?.message);
  }
}
