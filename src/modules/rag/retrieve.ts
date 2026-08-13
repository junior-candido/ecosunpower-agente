import type { SupabaseClient } from '@supabase/supabase-js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

type EmbedFn = (texts: string[]) => Promise<number[][]>;
interface Cfg { ragTopK: number; ragMinSimilarity: number; openaiApiKey?: string; }

// [B2a] Chave do conhecimento (eva_knowledge_chunks.tenant_id, que é TEXT) da
// empresa da mensagem. EcoSun e mensagens legadas (sem companyId) usam o slug
// histórico 'ecosunpower' — é como os chunks existentes foram ingeridos. Outro
// tenant usa o próprio company_id como chave: enquanto ele não tiver
// conhecimento ingerido, o match devolve vazio e a Eva cai no core do modo —
// falha-fechado, nunca respondendo com o catálogo da EcoSun.
export function ragTenantDe(companyId?: string | null): string {
  return !companyId || companyId === ECOSUN_COMPANY_ID ? 'ecosunpower' : companyId;
}

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
