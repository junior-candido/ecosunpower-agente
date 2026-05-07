import { describe, it, expect, vi } from 'vitest';
import { SiteDeployService } from '../src/modules/site-deploy.js';

describe('SiteDeployService', () => {
  it('chama o webhook configurado e retorna true em sucesso', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const svc = new SiteDeployService({
      hookUrl: 'https://api.cloudflare.com/hook/abc',
      fetcher: fetchMock as any,
    });
    const ok = await svc.dispatchRebuild();
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/hook/abc',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('retorna false e nao throw se hookUrl ausente', async () => {
    const svc = new SiteDeployService({ hookUrl: '', fetcher: vi.fn() as any });
    const ok = await svc.dispatchRebuild();
    expect(ok).toBe(false);
  });

  it('retorna false se webhook responder erro', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const svc = new SiteDeployService({
      hookUrl: 'https://api.cloudflare.com/hook/abc',
      fetcher: fetchMock as any,
    });
    const ok = await svc.dispatchRebuild();
    expect(ok).toBe(false);
  });

  it('retorna false se fetch lancar excecao', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    const svc = new SiteDeployService({
      hookUrl: 'https://api.cloudflare.com/hook/abc',
      fetcher: fetchMock as any,
    });
    const ok = await svc.dispatchRebuild();
    expect(ok).toBe(false);
  });
});
