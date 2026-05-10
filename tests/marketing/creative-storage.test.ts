import { describe, it, expect, vi } from 'vitest';
import { CreativeStorage } from '../../src/modules/marketing/creative-storage.js';
import type { CreativePackage } from '../../src/modules/marketing/types.js';

const PKG_MOCK: CreativePackage = {
  briefing: 'casa DF',
  persona_id: 1,
  imagens: [{ url: 'http://x', style: 'fotorealista', prompt_used: 'p' }],
  copies: [{ length: 'curto', headline: 'h', body: 'b', cta: 'c' }],
  cta_primario: 'Falar agora',
  justificativa: 'OK',
};

function makeMockClient(opts: { insertReturn?: unknown; insertError?: unknown; uploadError?: unknown } = {}) {
  const select = vi.fn().mockReturnThis();
  const single = vi.fn().mockResolvedValue({ data: opts.insertReturn ?? { id: 42 }, error: opts.insertError ?? null });
  const insert = vi.fn(() => ({ select, single }));
  insert.mockImplementation(() => ({ select, single }));

  const insertVoid = vi.fn().mockResolvedValue({ error: null });
  const fromTable = vi.fn().mockImplementation((t: string) => {
    if (t === 'marketing_creative_logs') return { insert: insertVoid };
    return { insert };
  });

  const upload = vi.fn().mockResolvedValue({ error: opts.uploadError ?? null });
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://supabase.co/x.png' } });
  const storageFrom = vi.fn().mockReturnValue({ upload, getPublicUrl });

  return {
    from: fromTable,
    storage: { from: storageFrom },
  } as any;
}

describe('CreativeStorage', () => {
  it('persistDraft retorna id do registro inserido', async () => {
    const storage = new CreativeStorage(makeMockClient({ insertReturn: { id: 99 } }));
    const id = await storage.persistDraft(PKG_MOCK, 'claude-opus-4-7');
    expect(id).toBe(99);
  });

  it('persistDraft propaga erro', async () => {
    const storage = new CreativeStorage(makeMockClient({ insertError: { message: 'boom' } }));
    await expect(storage.persistDraft(PKG_MOCK, 'claude-opus-4-7')).rejects.toBeDefined();
  });

  it('uploadImage retorna publicUrl', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() });
    const storage = new CreativeStorage(makeMockClient());
    const url = await storage.uploadImage('http://x.com/img.png', 1, 0);
    expect(url).toBe('https://supabase.co/x.png');
  });

  it('uploadImage falha se download falha', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const storage = new CreativeStorage(makeMockClient());
    await expect(storage.uploadImage('http://x.com/img.png', 1, 0)).rejects.toThrow('Download falhou');
  });

  it('logGeneration nao throw', async () => {
    const storage = new CreativeStorage(makeMockClient());
    await expect(storage.logGeneration({
      creative_id: 1, prompt: 'p', raw_output: {}, decision: 'sent_to_junior',
    })).resolves.toBeUndefined();
  });
});
