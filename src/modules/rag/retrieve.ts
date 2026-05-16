import type { SupabaseClient } from '@supabase/supabase-js';

type EmbedFn = (texts: string[]) => Promise<number[][]>;
interface Cfg { ragTopK: number; ragMinSimilarity: number; openaiApiKey?: string; }

export async function retrieveChunks(
  query: string,
  supabase: Pick<SupabaseClient, 'rpc'>,
  cfg: Cfg,
  embed: EmbedFn,
  tenant = 'ecosunpower',
): Promise<string[]> {
  if (!cfg.openaiApiKey || !query.trim()) return [];
  try {
    const [emb] = await embed([query]);
    if (!emb) return [];
    const { data, error } = await supabase.rpc('match_eva_chunks', {
      query_embedding: emb as unknown as string,
      p_tenant: tenant,
      match_count: cfg.ragTopK,
      min_similarity: cfg.ragMinSimilarity,
    });
    if (error || !data) return [];
    return (data as Array<{ content: string }>).map(d => d.content);
  } catch (e) {
    console.warn('[rag] retrieve falhou:', (e as Error).message);
    return [];
  }
}
