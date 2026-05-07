import { describe, it, expect, vi } from 'vitest';
import { PublicReviewsService, type PublicReviewRow } from '../src/modules/public-reviews.js';

const sampleRow: PublicReviewRow = {
  id: 'aaa-111',
  case_slug: null,
  cliente_nome: 'Maria S.',
  cliente_cidade: 'Brasília-DF',
  cliente_telefone: null,
  estrelas: 5,
  texto: 'Ótimo atendimento',
  foto_url: null,
  created_at: '2026-05-07T19:00:00Z',
  approved_for_marketing: false,
  approved_at: null,
};

interface FakeOpts {
  singleResult?: { data: any; error: any };
  maybeSingleResult?: { data: any; error: any };
  listResult?: { data: any[]; error: any };
}

function makeFakeSupabase(opts: FakeOpts = {}) {
  const builder: any = {};
  builder.from = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve(opts.listResult ?? { data: [], error: null }));
  builder.single = vi.fn(() => Promise.resolve(opts.singleResult ?? { data: null, error: null }));
  builder.maybeSingle = vi.fn(() => Promise.resolve(opts.maybeSingleResult ?? { data: null, error: null }));
  return builder;
}

describe('PublicReviewsService', () => {
  it('approve seta approved_for_marketing=true e approved_at, retorna a row', async () => {
    const supa = makeFakeSupabase({
      singleResult: {
        data: { ...sampleRow, approved_for_marketing: true, approved_at: '2026-05-07T19:30:00Z' },
        error: null,
      },
    });
    const svc = new PublicReviewsService(supa);
    const row = await svc.approve('aaa-111');
    expect(row.approved_for_marketing).toBe(true);
    expect(supa.update).toHaveBeenCalledWith(expect.objectContaining({
      approved_for_marketing: true,
      approved_at: expect.any(String),
    }));
    expect(supa.eq).toHaveBeenCalledWith('id', 'aaa-111');
  });

  it('approve lança erro se id nao existe', async () => {
    const supa = makeFakeSupabase({ singleResult: { data: null, error: null } });
    const svc = new PublicReviewsService(supa);
    await expect(svc.approve('nao-existe')).rejects.toThrow('not found');
  });

  it('approve lança erro se Supabase retornar error', async () => {
    const supa = makeFakeSupabase({ singleResult: { data: null, error: { message: 'rls violation' } } });
    const svc = new PublicReviewsService(supa);
    await expect(svc.approve('aaa-111')).rejects.toThrow('rls violation');
  });

  it('listPending retorna apenas reviews nao aprovadas', async () => {
    const supa = makeFakeSupabase({ listResult: { data: [sampleRow], error: null } });
    const svc = new PublicReviewsService(supa);
    const rows = await svc.listPending(5);
    expect(rows).toHaveLength(1);
    expect(rows[0].approved_for_marketing).toBe(false);
    expect(supa.eq).toHaveBeenCalledWith('approved_for_marketing', false);
  });

  it('getById retorna null quando nao encontra', async () => {
    const supa = makeFakeSupabase({ maybeSingleResult: { data: null, error: null } });
    const svc = new PublicReviewsService(supa);
    const row = await svc.getById('xx');
    expect(row).toBeNull();
  });
});
