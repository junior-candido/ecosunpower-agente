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
    writeFileSync(join(dir, 'empresa.md'), 'CORE não indexa');
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
    expect(embed.mock.calls.length).toBe(calls);
  });
});
