// tests/proposal-attachments-from-buffer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { processAttachmentFromBuffer } from '../src/modules/proposal/attachments/index.js';

const fakeSupabase = () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({ insert }),
    storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
    _insert: insert,
  } as any;
};

vi.mock('../src/modules/proposal/attachments/storage-uploader.js', () => ({
  uploadToStorage: vi.fn().mockResolvedValue({ storagePath: 'propostas/SLUG/foto-1.jpg' }),
  getSignedUrlFromPath: vi.fn().mockResolvedValue('https://signed/x'),
}));

describe('processAttachmentFromBuffer', () => {
  it('foto: valida tamanho + chama upload + persiste DB sem fazer download WABA', async () => {
    const supabase = fakeSupabase();
    const buf = Buffer.alloc(100_000); // 100KB
    const r = await processAttachmentFromBuffer(supabase, {
      buffer: buf,
      mimeType: 'image/jpeg',
      proposalSlug: 'SLUG',
      legenda: 'Teste',
      fotoCount: 0,
      videoCount: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.tipo).toBe('foto');
      expect(r.record.ordem).toBe(1);
      expect(r.record.storagePath).toBe('propostas/SLUG/foto-1.jpg');
    }
    expect(supabase._insert).toHaveBeenCalledOnce();
  });

  it('rejeita foto > 20MB', async () => {
    const supabase = fakeSupabase();
    const buf = Buffer.alloc(25 * 1024 * 1024);
    const r = await processAttachmentFromBuffer(supabase, {
      buffer: buf,
      mimeType: 'image/jpeg',
      proposalSlug: 'SLUG',
      legenda: 'Big',
      fotoCount: 0,
      videoCount: 0,
    });
    expect(r.ok).toBe(false);
  });

  it('rejeita 4ª foto (limite 3)', async () => {
    const supabase = fakeSupabase();
    const r = await processAttachmentFromBuffer(supabase, {
      buffer: Buffer.alloc(1000),
      mimeType: 'image/jpeg',
      proposalSlug: 'SLUG',
      legenda: 'X',
      fotoCount: 3,
      videoCount: 0,
    });
    expect(r.ok).toBe(false);
  });
});
