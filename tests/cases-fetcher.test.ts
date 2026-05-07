import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CasesFetcher, type Case } from '../src/modules/cases-fetcher.js';

const sampleCase: Case = {
  slug: 'caso1',
  titulo: 'Caso 1',
  cidade: 'Brasília',
  uf: 'DF',
  tipo: 'residencial',
  fotoPrincipal: '/cases/caso1/cover.jpg',
  fotos: [],
  featured: true,
};

describe('CasesFetcher', () => {
  beforeEach(() => vi.clearAllMocks());

  it('busca cases.json e cacheia por TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [sampleCase] });
    const fetcher = new CasesFetcher({ siteUrl: 'https://exemplo.com', fetcher: fetchMock as any });

    const r1 = await fetcher.getAll();
    const r2 = await fetcher.getAll();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toEqual([sampleCase]);
    expect(r2).toEqual([sampleCase]);
  });

  it('expira cache apos TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [sampleCase] });
    const fetcher = new CasesFetcher({ siteUrl: 'https://exemplo.com', fetcher: fetchMock as any, ttlMs: 1 });

    await fetcher.getAll();
    await new Promise(r => setTimeout(r, 10));
    await fetcher.getAll();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('filtra por tipo respeitando limit', async () => {
    const cases: Case[] = [
      { ...sampleCase, slug: 'a', tipo: 'residencial', featured: false },
      { ...sampleCase, slug: 'b', tipo: 'comercial', featured: true },
      { ...sampleCase, slug: 'c', tipo: 'comercial', featured: true },
    ];
    const fetcher = new CasesFetcher({
      siteUrl: 'https://exemplo.com',
      fetcher: (() => Promise.resolve({ ok: true, json: async () => cases })) as any,
    });

    const result = await fetcher.getByTipo('comercial', 3);
    expect(result.length).toBe(2);
    expect(result.every(c => c.tipo === 'comercial')).toBe(true);
  });

  it('completa com featured se tipo nao tem suficientes', async () => {
    const cases: Case[] = [
      { ...sampleCase, slug: 'a', tipo: 'residencial', featured: true },
      { ...sampleCase, slug: 'b', tipo: 'comercial', featured: true },
    ];
    const fetcher = new CasesFetcher({
      siteUrl: 'https://exemplo.com',
      fetcher: (() => Promise.resolve({ ok: true, json: async () => cases })) as any,
    });

    const result = await fetcher.getByTipo('industrial', 3);
    expect(result.length).toBe(2);
    expect(result.every(c => c.featured)).toBe(true);
  });

  it('retorna [] sem throw se fetch falhar e nao houver cache', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    const fetcher = new CasesFetcher({ siteUrl: 'https://exemplo.com', fetcher: fetchMock as any });
    const result = await fetcher.getAll();
    expect(result).toEqual([]);
  });

  it('usa cache antigo se fetch falhar e ja houver cache', async () => {
    const ok = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [sampleCase] });
    const fail = vi.fn().mockRejectedValue(new Error('network'));
    let call = 0;
    const fetcher = new CasesFetcher({
      siteUrl: 'https://exemplo.com',
      ttlMs: 1,
      fetcher: ((url: string) => {
        call++;
        return call === 1 ? ok(url) : fail(url);
      }) as any,
    });

    const r1 = await fetcher.getAll();
    await new Promise(r => setTimeout(r, 10));
    const r2 = await fetcher.getAll();
    expect(r1).toEqual([sampleCase]);
    expect(r2).toEqual([sampleCase]);
  });
});
