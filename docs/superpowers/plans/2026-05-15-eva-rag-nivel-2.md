# Eva RAG Nível 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a injeção de ~71k tokens de knowledge por query por RAG semântico (~9k tokens), mantendo a Eva tecnicamente precisa.

**Architecture:** Pipeline isolado em `src/modules/rag/` — chunker puro → embeddings OpenAI → ingest hash-sync no pgvector → retrieve por similaridade. `brain.ts` passa a montar contexto = 6 arquivos core fixos + chunks do retrieve. Degrada para core-only se faltar key/match.

**Tech Stack:** Node 20, TypeScript ESM, `openai` (novo), `@supabase/supabase-js` (existente), pgvector/hnsw no Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-15-eva-rag-nivel-2-design.md`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/rag/chunker.ts` (criar) | **Puro.** markdown → `Chunk[]` (recursivo 600/80, H2→H3→¶→fixed) |
| `src/modules/rag/embeddings.ts` (criar) | Wrapper OpenAI `text-embedding-3-small`, batch + retry |
| `src/modules/rag/ingest.ts` (criar) | Varre `conhecimento/` (−6 core), hash-diff, chunk, embed, upsert; `syncFile()` |
| `src/modules/rag/retrieve.ts` (criar) | Embeda query → RPC `match_eva_chunks` → `RetrievedChunk[]` |
| `src/modules/rag/core-files.ts` (criar) | Constante: os 6 arquivos core + loader do disco (reuso ingest/brain) |
| `scripts/ingest.ts` (criar) | Entry `npm run ingest` |
| `supabase/migrations/030_eva_knowledge_chunks.sql` (criar) | Migration (Junior aplica manual no prod) |
| `tests/rag/*.test.ts` (criar) | Testes por unidade |
| `src/config.ts` (modificar) | Add `ragTopK`, `ragMinSimilarity` (env) |
| `package.json` (modificar) | Dep `openai` + script `ingest` |
| `src/modules/brain.ts` (modificar) | Contexto híbrido: 6 core + retrieve |
| `src/index.ts` (modificar) | Smart-sync não-bloqueante no startup |
| `src/modules/news-scraper.ts` (modificar) | Após reescrever canal-solar.md → `ingest.syncFile` |

---

## Task 1: Dependência + config

**Files:**
- Modify: `package.json`
- Modify: `src/config.ts`

- [ ] **Step 1: Instalar `openai`**

Run: `npm install openai@^4.67.0`
Expected: adiciona em `dependencies`, sem erro de peer.

- [ ] **Step 2: Add script `ingest` no package.json**

Em `"scripts"` adicionar:
```json
"ingest": "tsx scripts/ingest.ts"
```
(o repo já usa `tsx`/`vitest`; se não houver `tsx`, usar `"ingest": "node --import tsx scripts/ingest.ts"` — confirmar `tsx` em devDeps, senão `npm i -D tsx`.)

- [ ] **Step 3: Add envs RAG no config.ts**

No schema zod do `src/config.ts`, ao lado dos envs existentes, adicionar:
```ts
  ragTopK: z.coerce.number().int().positive().default(5),
  ragMinSimilarity: z.coerce.number().min(0).max(1).default(0.35),
```
E no objeto que lê `process.env`:
```ts
    ragTopK: process.env.RAG_TOP_K,
    ragMinSimilarity: process.env.RAG_MIN_SIMILARITY,
```
(`openaiApiKey` já existe — confirmar; não duplicar.)

- [ ] **Step 4: Build**

Run: `npx tsc`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/config.ts
git commit -m "chore(rag): dep openai + envs RAG_TOP_K/RAG_MIN_SIMILARITY"
```

---

## Task 2: Migration 030 (arquivo + SQL pro Junior)

**Files:**
- Create: `supabase/migrations/030_eva_knowledge_chunks.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- 030_eva_knowledge_chunks.sql — RAG Nivel 2 (aplicar MANUAL no prod kupnsoyymulbdzakqlqc)
create extension if not exists vector;

create table if not exists eva_knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default 'ecosunpower',
  source_file text not null,
  chunk_index int  not null,
  content     text not null,
  token_count int,
  file_hash   text not null,
  embedding   vector(1536) not null,
  created_at  timestamptz default now(),
  unique (tenant_id, source_file, chunk_index)
);
create index if not exists eva_kc_embedding_idx
  on eva_knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists eva_kc_file_idx
  on eva_knowledge_chunks (tenant_id, source_file);

create or replace function match_eva_chunks(
  query_embedding vector(1536), p_tenant text, match_count int, min_similarity float
) returns table (source_file text, content text, similarity float)
language sql stable as $$
  select source_file, content, 1 - (embedding <=> query_embedding) as similarity
  from eva_knowledge_chunks
  where tenant_id = p_tenant
    and 1 - (embedding <=> query_embedding) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 2: Entregar o SQL pro Junior aplicar** (não dá pra automatizar — MCP aponta projeto errado)

Mensagem pro Junior: "Roda esse arquivo inteiro no Supabase SQL Editor do projeto `kupnsoyymulbdzakqlqc`. Depois confirma com: `select count(*) from eva_knowledge_chunks;` (deve dar 0) e `select proname from pg_proc where proname='match_eva_chunks';` (deve listar 1)."

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/030_eva_knowledge_chunks.sql
git commit -m "feat(rag): migration 030 eva_knowledge_chunks (pgvector hnsw + match rpc)"
```

---

## Task 3: Core files (constante + loader)

**Files:**
- Create: `src/modules/rag/core-files.ts`
- Test: `tests/rag/core-files.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { CORE_FILES, isCoreFile } from '../../src/modules/rag/core-files.js';

describe('core-files', () => {
  it('tem exatamente os 6 core', () => {
    expect([...CORE_FILES].sort()).toEqual(
      ['empresa.md','faq.md','indicacao.md','objecoes.md','perguntas-qualificacao.md','processo.md'].sort());
  });
  it('isCoreFile reconhece core e ignora resto', () => {
    expect(isCoreFile('empresa.md')).toBe(true);
    expect(isCoreFile('especializado/dimensionamento.md')).toBe(false);
    expect(isCoreFile('faq.md')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — espera FAIL** (`Cannot find module core-files`)

Run: `npx vitest run tests/rag/core-files.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/rag/core-files.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const CORE_FILES: ReadonlySet<string> = new Set([
  'empresa.md', 'faq.md', 'objecoes.md',
  'perguntas-qualificacao.md', 'processo.md', 'indicacao.md',
]);

export function isCoreFile(relPath: string): boolean {
  return CORE_FILES.has(relPath.replace(/\\/g, '/'));
}

/** Concatena os 6 core lidos do disco (sempre injetados no brain). */
export function loadCoreContent(conhecimentoDir: string): string {
  const parts: string[] = [];
  for (const f of CORE_FILES) {
    const p = join(conhecimentoDir, f);
    if (existsSync(p)) parts.push(`[${f.replace('.md','')}]\n${readFileSync(p, 'utf-8')}`);
  }
  return parts.join('\n\n');
}
```

- [ ] **Step 4: Run — espera PASS**

Run: `npx vitest run tests/rag/core-files.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add src/modules/rag/core-files.ts tests/rag/core-files.test.ts
git commit -m "feat(rag): core-files (6 fixos + loader)"
```

---

## Task 4: Chunker (puro, TDD)

**Files:**
- Create: `src/modules/rag/chunker.ts`
- Test: `tests/rag/chunker.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { chunkMarkdown, estimateTokens } from '../../src/modules/rag/chunker.js';

describe('estimateTokens', () => {
  it('aproxima ~4 chars/token, nunca < 1 pra texto', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('chunkMarkdown', () => {
  it('texto curto vira 1 chunk', () => {
    const c = chunkMarkdown('# T\n\nparágrafo curto.', { maxTokens: 600, overlapTokens: 80 });
    expect(c.length).toBe(1);
    expect(c[0].content).toContain('parágrafo curto.');
    expect(c[0].index).toBe(0);
  });

  it('quebra por H2 quando excede o limite', () => {
    const big = 'x'.repeat(2000); // ~500 tok cada
    const md = `## A\n\n${big}\n\n## B\n\n${big}`;
    const c = chunkMarkdown(md, { maxTokens: 600, overlapTokens: 80 });
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c[0].content).toContain('## A');
    expect(c.some(k => k.content.includes('## B'))).toBe(true);
  });

  it('seção gigante sem H2 cai pra split fixo com overlap', () => {
    const huge = Array.from({ length: 50 }, (_, i) => `linha ${i} ${'y'.repeat(80)}`).join('\n');
    const c = chunkMarkdown(huge, { maxTokens: 300, overlapTokens: 50 });
    expect(c.length).toBeGreaterThan(1);
    // overlap: fim do chunk n aparece no começo do n+1
    const tail = c[0].content.slice(-40);
    expect(c[1].content.includes(tail.trim().split('\n').pop()!.slice(0, 10))).toBe(true);
    expect(c.every(k => estimateTokens(k.content) <= 300 + 50)).toBe(true);
  });

  it('índices sequenciais e sem chunk vazio', () => {
    const c = chunkMarkdown('## A\n\nzzz\n\n## B\n\nwww', { maxTokens: 600, overlapTokens: 80 });
    c.forEach((k, i) => { expect(k.index).toBe(i); expect(k.content.trim().length).toBeGreaterThan(0); });
  });

  it('degrada com graça: vazio/whitespace → []', () => {
    expect(chunkMarkdown('', { maxTokens: 600, overlapTokens: 80 })).toEqual([]);
    expect(chunkMarkdown('   \n\n  ', { maxTokens: 600, overlapTokens: 80 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — espera FAIL**

Run: `npx vitest run tests/rag/chunker.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// src/modules/rag/chunker.ts
export interface Chunk { index: number; content: string; tokenCount: number; }
export interface ChunkOpts { maxTokens: number; overlapTokens: number; }

// Aproximação determinística (~4 chars/token). A API de embedding faz a
// tokenização real; aqui só precisamos limitar o tamanho do chunk.
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function splitFixed(text: string, max: number, overlap: number): string[] {
  const maxChars = max * 4, overlapChars = overlap * 4;
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + maxChars, text.length);
    out.push(text.slice(i, end));
    if (end >= text.length) break;
    i = end - overlapChars;
    if (i <= 0) i = end;
  }
  return out;
}

// Split recursivo: tenta H2, depois H3, depois parágrafo, depois fixo.
function recursiveSplit(text: string, max: number, overlap: number): string[] {
  if (estimateTokens(text) <= max) return [text];
  for (const re of [/(?=^##\s)/m, /(?=^###\s)/m, /\n\n+/]) {
    const parts = text.split(re).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const out: string[] = [];
      let buf = '';
      for (const p of parts) {
        const cand = buf ? `${buf}\n\n${p}` : p;
        if (estimateTokens(cand) <= max) { buf = cand; continue; }
        if (buf) out.push(buf);
        if (estimateTokens(p) > max) out.push(...recursiveSplit(p, max, overlap));
        else buf = p;
        if (out.length && estimateTokens(p) <= max) buf = p;
      }
      if (buf) out.push(buf);
      return out;
    }
  }
  return splitFixed(text, max, overlap);
}

export function chunkMarkdown(md: string, opts: ChunkOpts): Chunk[] {
  const text = (md ?? '').trim();
  if (!text) return [];
  const pieces = recursiveSplit(text, opts.maxTokens, opts.overlapTokens)
    .map(p => p.trim()).filter(Boolean);
  return pieces.map((content, index) => ({
    index, content, tokenCount: estimateTokens(content),
  }));
}
```

- [ ] **Step 4: Run — espera PASS** (ajustar implementação até os 5 testes do chunker passarem; o teste de overlap valida que `splitFixed` repete a cauda)

Run: `npx vitest run tests/rag/chunker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/rag/chunker.ts tests/rag/chunker.test.ts
git commit -m "feat(rag): chunker recursivo 600/80 (puro, TDD)"
```

---

## Task 5: Embeddings (wrapper OpenAI)

**Files:**
- Create: `src/modules/rag/embeddings.ts`
- Test: `tests/rag/embeddings.test.ts`

- [ ] **Step 1: Failing test** (mock do client OpenAI)

```ts
import { describe, it, expect, vi } from 'vitest';

describe('embedTexts', () => {
  it('retorna 1 vetor por input, em batches', async () => {
    const create = vi.fn().mockResolvedValue({ data: [{ embedding: [0.1] }, { embedding: [0.2] }] });
    const { embedTexts } = await import('../../src/modules/rag/embeddings.js');
    const fakeClient = { embeddings: { create } } as any;
    const out = await embedTexts(['a', 'b'], fakeClient);
    expect(out).toEqual([[0.1], [0.2]]);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'text-embedding-3-small', input: ['a','b'] }));
  });

  it('lista vazia → [] sem chamar API', async () => {
    const create = vi.fn();
    const { embedTexts } = await import('../../src/modules/rag/embeddings.js');
    expect(await embedTexts([], { embeddings: { create } } as any)).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — espera FAIL**

Run: `npx vitest run tests/rag/embeddings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/rag/embeddings.ts
import OpenAI from 'openai';

export const EMBED_MODEL = 'text-embedding-3-small';
const BATCH = 96;

export function makeClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 500 * 2 ** i)); }
  }
  throw last;
}

export async function embedTexts(
  texts: string[],
  client: Pick<OpenAI, 'embeddings'>,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await withRetry(() =>
      client.embeddings.create({ model: EMBED_MODEL, input: batch }));
    out.push(...res.data.map(d => d.embedding as number[]));
  }
  return out;
}
```

- [ ] **Step 4: Run — espera PASS**

Run: `npx vitest run tests/rag/embeddings.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add src/modules/rag/embeddings.ts tests/rag/embeddings.test.ts
git commit -m "feat(rag): embeddings wrapper OpenAI (batch+retry)"
```

---

## Task 6: Retrieve

**Files:**
- Create: `src/modules/rag/retrieve.ts`
- Test: `tests/rag/retrieve.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest';

describe('retrieveChunks', () => {
  const cfg = { ragTopK: 5, ragMinSimilarity: 0.35, openaiApiKey: 'k' } as any;

  it('embeda query e chama RPC match_eva_chunks; retorna contents', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [
      { source_file: 'a.md', content: 'AAA', similarity: 0.8 }], error: null });
    const supa = { rpc } as any;
    const { retrieveChunks } = await import('../../src/modules/rag/retrieve.js');
    const r = await retrieveChunks('qual inversor?', supa, cfg, async () => [[0.1]]);
    expect(r).toEqual(['AAA']);
    expect(rpc).toHaveBeenCalledWith('match_eva_chunks', expect.objectContaining({
      p_tenant: 'ecosunpower', match_count: 5, min_similarity: 0.35 }));
  });

  it('sem OPENAI key → [] (fallback core-only no caller)', async () => {
    const { retrieveChunks } = await import('../../src/modules/rag/retrieve.js');
    const r = await retrieveChunks('x', { rpc: vi.fn() } as any,
      { ...cfg, openaiApiKey: '' }, async () => { throw new Error('no'); });
    expect(r).toEqual([]);
  });

  it('erro na RPC → [] (nunca lança)', async () => {
    const supa = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) } as any;
    const { retrieveChunks } = await import('../../src/modules/rag/retrieve.js');
    expect(await retrieveChunks('x', supa, cfg, async () => [[0.1]])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — espera FAIL**

Run: `npx vitest run tests/rag/retrieve.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/rag/retrieve.ts
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
```

- [ ] **Step 4: Run — espera PASS**

Run: `npx vitest run tests/rag/retrieve.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/modules/rag/retrieve.ts tests/rag/retrieve.test.ts
git commit -m "feat(rag): retrieve (embeda query + RPC match, fallback [])"
```

---

## Task 7: Ingest (hash-sync)

**Files:**
- Create: `src/modules/rag/ingest.ts`
- Test: `tests/rag/ingest.test.ts`

- [ ] **Step 1: Failing test** (Supabase mockado, fs real em tmp)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function fakeSupabase() {
  const rows: any[] = [];
  return {
    rows,
    from: () => ({
      select: () => ({ data: rows.map(r => ({ source_file: r.source_file, file_hash: r.file_hash })), error: null }),
      delete: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }),
      upsert: (recs: any[]) => { rows.push(...recs); return { error: null }; },
    }),
  };
}

describe('ingestAll', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rag-'));
    mkdirSync(join(dir, 'especializado'), { recursive: true });
    writeFileSync(join(dir, 'empresa.md'), 'CORE não indexa');           // core → ignora
    writeFileSync(join(dir, 'especializado', 'dimensionamento.md'), '# Dim\n\n' + 'a'.repeat(50));
  });

  it('ignora core, chunk+embeda+upserta o resto', async () => {
    const supa = fakeSupabase();
    const { ingestAll } = await import('../../src/modules/rag/ingest.js');
    const embed = vi.fn(async (t: string[]) => t.map(() => [0.1]));
    const n = await ingestAll(dir, supa as any, embed as any);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(supa.rows.some(r => r.source_file === 'especializado/dimensionamento.md')).toBe(true);
    expect(supa.rows.some(r => r.source_file === 'empresa.md')).toBe(false);
  });

  it('idempotente: 2ª rodada sem mudança = 0 embeddings novos', async () => {
    const supa = fakeSupabase();
    const { ingestAll } = await import('../../src/modules/rag/ingest.js');
    const embed = vi.fn(async (t: string[]) => t.map(() => [0.1]));
    await ingestAll(dir, supa as any, embed as any);
    const calls = embed.mock.calls.length;
    await ingestAll(dir, supa as any, embed as any);
    expect(embed.mock.calls.length).toBe(calls); // hash igual → não re-embeda
  });
});
```

- [ ] **Step 2: Run — espera FAIL**

Run: `npx vitest run tests/rag/ingest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/rag/ingest.ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
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

async function existingHashes(supabase: any, tenant: string): Promise<Map<string, string>> {
  const { data } = await supabase.from('eva_knowledge_chunks')
    .select('source_file, file_hash').eq?.('tenant_id', tenant) ?? { data: [] };
  const m = new Map<string, string>();
  for (const r of (data ?? [])) m.set(r.source_file, r.file_hash);
  return m;
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
  await supabase.from('eva_knowledge_chunks').delete().eq('tenant_id', tenant).eq('source_file', relPath);
  await supabase.from('eva_knowledge_chunks').upsert(chunks.map((c, i) => ({
    tenant_id: tenant, source_file: relPath, chunk_index: c.index,
    content: c.content, token_count: c.tokenCount, file_hash: fhash,
    embedding: vectors[i],
  })));
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
    if (prev.get(rel) === fhash) continue;          // hash igual → skip (idempotente)
    total += await syncFile(conhecimentoDir, rel, supabase, embed, tenant);
  }
  return total;
}
```

- [ ] **Step 4: Run — espera PASS** (ajustar o mock/`existingHashes` até idempotência passar)

Run: `npx vitest run tests/rag/ingest.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add src/modules/rag/ingest.ts tests/rag/ingest.test.ts
git commit -m "feat(rag): ingest hash-sync (ignora core, idempotente)"
```

---

## Task 8: Script `npm run ingest` + startup não-bloqueante

**Files:**
- Create: `scripts/ingest.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Criar `scripts/ingest.ts`**

```ts
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../src/config.js';
import { makeClient, embedTexts } from '../src/modules/rag/embeddings.js';
import { ingestAll } from '../src/modules/rag/ingest.js';
import { SupabaseService } from '../src/modules/supabase.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'conhecimento');
if (!config.openaiApiKey) { console.error('[ingest] OPENAI_API_KEY ausente'); process.exit(1); }
const client = makeClient(config.openaiApiKey);
const supa = new SupabaseService(config).getClient();
const n = await ingestAll(dir, supa, (t) => embedTexts(t, client));
console.log(`[ingest] ${n} chunks (re)embedados`);
process.exit(0);
```
(Confirmar como `config`/`SupabaseService` são exportados; ajustar imports aos nomes reais.)

- [ ] **Step 2: Startup não-bloqueante no `src/index.ts`**

Perto dos outros `setTimeout` de scheduler, adicionar:
```ts
  // RAG smart-sync: não-bloqueante, após boot. Idempotente por hash.
  if (config.openaiApiKey) {
    setTimeout(async () => {
      try {
        const { makeClient, embedTexts } = await import('./modules/rag/embeddings.js');
        const { ingestAll } = await import('./modules/rag/ingest.js');
        const cli = makeClient(config.openaiApiKey!);
        const dir = join(__dirname, '..', 'conhecimento');
        const n = await ingestAll(dir, supabase.getClient(), (t) => embedTexts(t, cli));
        console.log(`[rag] startup sync: ${n} chunks (re)embedados`);
      } catch (e) { console.error('[rag] startup sync falhou:', (e as Error).message); }
    }, 90 * 1000); // 90s após boot
  } else {
    console.log('[rag] OPENAI_API_KEY ausente — RAG desligado, brain usa só core');
  }
```

- [ ] **Step 3: Build + suíte**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; suíte verde (só a falha pré-existente `cases-fetcher` permitida).

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest.ts src/index.ts
git commit -m "feat(rag): npm run ingest + smart-sync nao-bloqueante no startup"
```

---

## Task 9: Brain híbrido (6 core + retrieve)

**Files:**
- Modify: `src/modules/brain.ts`
- Modify: `src/index.ts` (onde monta knowledge pro brain)
- Test: `tests/rag/brain-hybrid.test.ts`

- [ ] **Step 1: Failing test** (monta contexto = core + chunks; fallback core-only)

```ts
import { describe, it, expect } from 'vitest';
import { buildHybridKnowledge } from '../../src/modules/rag/hybrid.js';

describe('buildHybridKnowledge', () => {
  it('core + chunks concatenados', () => {
    const out = buildHybridKnowledge('CORE6', ['chunkA', 'chunkB']);
    expect(out).toContain('CORE6');
    expect(out).toContain('chunkA');
    expect(out).toContain('chunkB');
  });
  it('sem chunks → só core (fallback)', () => {
    expect(buildHybridKnowledge('CORE6', [])).toBe('CORE6');
  });
});
```

- [ ] **Step 2: Run — espera FAIL**

Run: `npx vitest run tests/rag/brain-hybrid.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/modules/rag/hybrid.ts`**

```ts
// src/modules/rag/hybrid.ts
export function buildHybridKnowledge(coreContent: string, chunks: string[]): string {
  if (chunks.length === 0) return coreContent;
  return `${coreContent}\n\n## CONHECIMENTO RELEVANTE (RAG)\n\n${chunks.join('\n\n---\n\n')}`;
}
```

- [ ] **Step 4: Integrar no fluxo da mensagem (`src/index.ts`)**

Onde hoje monta `knowledgeBase.getCore()` + `getSpecialized(detectTopics(text))` pro brain, trocar por:
```ts
  const { loadCoreContent } = await import('./modules/rag/core-files.js');
  const { retrieveChunks } = await import('./modules/rag/retrieve.js');
  const { makeClient, embedTexts } = await import('./modules/rag/embeddings.js');
  const { buildHybridKnowledge } = await import('./modules/rag/hybrid.js');
  const coreContent = loadCoreContent(join(__dirname, '..', 'conhecimento'));
  const chunks = config.openaiApiKey
    ? await retrieveChunks(text, supabase.getClient(), config,
        (q) => embedTexts(q, makeClient(config.openaiApiKey!)))
    : [];
  const knowledge = buildHybridKnowledge(coreContent, chunks);
```
e passar `knowledge` pro `brain.processMessage(...)` no lugar do knowledge antigo. **Não** remover `knowledge-topics.ts`/`KnowledgeBase` ainda (só parar de usar no fluxo cliente — remoção é fase posterior, após validar em prod).

- [ ] **Step 5: Run testes + build + suíte**

Run: `npx vitest run tests/rag/brain-hybrid.test.ts && npx tsc && npx vitest run`
Expected: hybrid PASS; build EXIT 0; suíte verde (só cases-fetcher pré-existente).

- [ ] **Step 6: Commit**

```bash
git add src/modules/rag/hybrid.ts tests/rag/brain-hybrid.test.ts src/index.ts
git commit -m "feat(rag): brain hibrido — 6 core + retrieve (fallback core-only)"
```

---

## Task 10: Hook do scraper (canal-solar.md)

**Files:**
- Modify: `src/modules/news-scraper.ts`

- [ ] **Step 1: Localizar onde o scraper reescreve `especializado/canal-solar.md`** (grep `canal-solar` em `news-scraper.ts`).

- [ ] **Step 2: Após o `writeFileSync` do canal-solar.md, adicionar re-embed só dele**

```ts
  // RAG: re-embeda só esse arquivo (mudou em runtime, sem deploy)
  try {
    if (config.openaiApiKey) {
      const { makeClient, embedTexts } = await import('./rag/embeddings.js');
      const { syncFile } = await import('./rag/ingest.js');
      const cli = makeClient(config.openaiApiKey);
      await syncFile(conhecimentoDir, 'especializado/canal-solar.md',
        supabase.getClient(), (t) => embedTexts(t, cli));
      console.log('[rag] canal-solar.md re-embedado pós-scraper');
    }
  } catch (e) { console.warn('[rag] re-embed canal-solar falhou:', (e as Error).message); }
```
(Ajustar `conhecimentoDir`/`supabase` aos nomes em escopo no scraper.)

- [ ] **Step 3: Build + suíte**

Run: `npx tsc && npx vitest run`
Expected: EXIT 0; verde (só cases-fetcher).

- [ ] **Step 4: Commit**

```bash
git add src/modules/news-scraper.ts
git commit -m "feat(rag): scraper re-embeda canal-solar.md em runtime"
```

---

## Task 11: Verificação end-to-end + entrega

- [ ] **Step 1: Junior aplica a migration 030** no Supabase prod (`kupnsoyymulbdzakqlqc`) — SQL da Task 2. Confirmar `match_eva_chunks` existe.

- [ ] **Step 2: `OPENAI_API_KEY` no Easypanel** (confirmar setado no serviço `agente-whatsapp`).

- [ ] **Step 3: Rodar ingest local apontando pro prod** (ou deixar o startup-sync rodar pós-deploy). Confirmar `select count(*) from eva_knowledge_chunks;` > 0 e por `source_file`.

- [ ] **Step 4: Smoke test em prod** — pergunta técnica de um número não-admin (ex: spec de inversor). Conferir no log `[rag]` que retrieve trouxe chunk; resposta da Eva precisa/coerente. Medir tokens/query (objetivo ~9k vs ~71k).

- [ ] **Step 5: Push + Implantar**

```bash
git push origin main
```
Junior: Implantar `agente-whatsapp`.

- [ ] **Step 6: Atualizar memória** — RAG Nível 2 MVP em prod; fast-follow nº1 = limpar `solax.md` (Junior valida specs) → ingere.

---

## Self-Review

**Spec coverage:** decisões 1-8 → Task: (1) embedding/config, (2) migration pgvector multi-tenant+RPC, (3) core 6 fixos, (4) chunking recursivo, (5) ingest hash-sync + script + startup + (10) scraper canal-solar, (6) corpus = não-core (.md), SolaX fora (Task 11 step 6 aponta fast-follow), (7) retrieve top-K/threshold env + fallback, (8) migration manual. ✅ sem gap.

**Placeholder scan:** sem TBD/TODO. Pontos "confirmar nome real do export" (config/SupabaseService/conhecimentoDir) são instruções de verificação no código existente, não placeholders de design — o engenheiro confere o símbolo real ao tocar o arquivo.

**Type consistency:** `embedTexts(texts, client)` usado igual em ingest/retrieve/script; `syncFile`/`ingestAll` assinaturas idênticas entre Task 7/8/10; `Chunk{index,content,tokenCount}` consistente chunker→ingest; RPC `match_eva_chunks(query_embedding,p_tenant,match_count,min_similarity)` idêntica migration↔retrieve.

**Escopo:** plano único, MVP testável. SolaX/PDFs explicitamente fora (fast-follow/fase posterior).
