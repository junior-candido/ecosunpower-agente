import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { isCoreFile } from './core-files.js';
import { chunkMarkdown } from './chunker.js';

const CHUNK = { maxTokens: 600, overlapTokens: 80 };
type EmbedFn = (texts: string[]) => Promise<number[][]>;

function listMd(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...listMd(full, base));
    else if (e.endsWith('.md')) out.push(relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

function isThenable(v: any): v is PromiseLike<any> {
  return v != null && typeof v.then === 'function';
}

async function existingHashes(supabase: any, tenant: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    // Build/exec the select. Real supabase-js returns a thenable query builder;
    // the simple test mock returns `{ data, error }` directly.
    let res: any = supabase
      .from('eva_knowledge_chunks')
      .select('source_file, file_hash');

    // Real client: narrow by tenant and chunk_index before awaiting. Mock has no `.eq` here.
    if (res && typeof res.eq === 'function') {
      res = res.eq('tenant_id', tenant).eq('chunk_index', 0); // 1 row/arquivo (cost-control: cabe sob o cap de 1000)
    }

    // Real client: builder is awaitable. Mock: plain object -> used as-is.
    if (isThenable(res)) {
      res = await res;
    }

    if (!res || res.error) return map;
    const data = res.data;
    if (!Array.isArray(data)) return map;
    for (const r of data) {
      if (r && typeof r.source_file === 'string' && typeof r.file_hash === 'string') {
        map.set(r.source_file, r.file_hash);
      }
    }
  } catch {
    return new Map();
  }
  return map;
}

export async function syncFile(
  conhecimentoDir: string, relPath: string,
  supabase: any, embed: EmbedFn, tenant = 'ecosunpower',
): Promise<number> {
  const content = readFileSync(join(conhecimentoDir, relPath), 'utf-8');
  const fhash = hash(content);
  const chunks = chunkMarkdown(content, CHUNK);
  if (chunks.length === 0) return 0;
  const vectors = await embed(chunks.map(c => c.content));
  const del = await supabase.from('eva_knowledge_chunks').delete().eq('tenant_id', tenant).eq('source_file', relPath);
  if (del && del.error) throw new Error(`[rag] delete falhou ${relPath}: ${del.error.message ?? del.error}`);
  const up = await supabase.from('eva_knowledge_chunks').upsert(chunks.map((c, i) => ({
    tenant_id: tenant, source_file: relPath, chunk_index: c.index,
    content: c.content, token_count: c.tokenCount, file_hash: fhash,
    embedding: vectors[i],
  })));
  if (up && up.error) throw new Error(`[rag] upsert falhou ${relPath}: ${up.error.message ?? up.error}`);
  return chunks.length;
}

export async function ingestAll(
  conhecimentoDir: string, supabase: any, embed: EmbedFn, tenant = 'ecosunpower',
): Promise<number> {
  const prev = await existingHashes(supabase, tenant);
  let total = 0;
  for (const rel of listMd(conhecimentoDir)) {
    if (isCoreFile(rel)) continue;
    const fhash = hash(readFileSync(join(conhecimentoDir, rel), 'utf-8'));
    if (prev.get(rel) === fhash) continue;
    total += await syncFile(conhecimentoDir, rel, supabase, embed, tenant);
  }
  return total;
}
