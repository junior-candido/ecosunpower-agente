import { describe, it, expect, vi } from 'vitest';

const uploadMock = vi.fn();
const removeMock = vi.fn();
const createSignedUrlMock = vi.fn();
const createSignedUrlsMock = vi.fn();
const fromMock = vi.fn().mockReturnValue({
  upload: uploadMock,
  remove: removeMock,
  createSignedUrl: createSignedUrlMock,
  createSignedUrls: createSignedUrlsMock,
});
const supabaseStub: any = { storage: { from: fromMock } };

describe('storage.uploadAnexo', () => {
  it('gera path padrão <leadId>/<tipo>/<uuid>.<ext>', async () => {
    uploadMock.mockResolvedValueOnce({ data: { path: 'lead-1/foto_telhado/abc.jpg' }, error: null });
    const { uploadAnexo } = await import('../src/modules/anexos/storage.js');
    const buf = Buffer.from('xx');
    const r = await uploadAnexo(supabaseStub, 'lead-1', 'foto_telhado', buf, 'image/jpeg', 'jpg');
    expect(r.ok).toBe(true);
    expect(r.storage_path).toMatch(/^lead-1\/foto_telhado\/[0-9a-f-]+\.jpg$/);
    expect(uploadMock).toHaveBeenCalled();
  });

  it('upload falha → retorna ok:false', async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: 'storage full' } });
    const { uploadAnexo } = await import('../src/modules/anexos/storage.js');
    const r = await uploadAnexo(supabaseStub, 'lead-1', 'contrato', Buffer.from('x'), 'application/pdf', 'pdf');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('storage full');
  });
});

describe('storage.deleteAnexoFile', () => {
  it('chama remove com path', async () => {
    removeMock.mockResolvedValueOnce({ data: null, error: null });
    const { deleteAnexoFile } = await import('../src/modules/anexos/storage.js');
    const r = await deleteAnexoFile(supabaseStub, 'lead-1/contrato/x.pdf');
    expect(r.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledWith(['lead-1/contrato/x.pdf']);
  });
});

describe('storage.getSignedUrls (batch)', () => {
  it('chama createSignedUrls com TTL', async () => {
    createSignedUrlsMock.mockResolvedValueOnce({
      data: [
        { path: 'lead-1/contrato/x.pdf', signedUrl: 'https://...?token=abc' },
        { path: 'lead-1/foto_telhado/y.jpg', signedUrl: 'https://...?token=def' },
      ],
      error: null,
    });
    const { getSignedUrls } = await import('../src/modules/anexos/storage.js');
    const r = await getSignedUrls(supabaseStub, ['lead-1/contrato/x.pdf', 'lead-1/foto_telhado/y.jpg'], 3600);
    expect(r['lead-1/contrato/x.pdf']).toContain('https://');
    expect(createSignedUrlsMock).toHaveBeenCalledWith(['lead-1/contrato/x.pdf', 'lead-1/foto_telhado/y.jpg'], 3600);
  });
});
