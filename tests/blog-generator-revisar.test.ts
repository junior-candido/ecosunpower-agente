// Métodos novos do BlogGenerator pra tela de revisão: getDraftById e updateDraftFields.
import { describe, it, expect, beforeEach } from 'vitest';
import { BlogGenerator } from '../src/modules/blog-generator.js';

let draftRow: Record<string, unknown> | null = null;
let updatedRow: Record<string, unknown> | null = null;
let updatedId: string | null = null;

const mockSupabase = {
  from: (_t: string) => ({
    select: (_c: string) => ({
      eq: (_col: string, _val: string) => ({
        maybeSingle: async () => ({ data: draftRow, error: null }),
      }),
    }),
    update: (row: Record<string, unknown>) => {
      updatedRow = row;
      return { eq: async (_c: string, id: string) => { updatedId = id; return { error: null }; } };
    },
  }),
} as any;

function makeGen() {
  return new BlogGenerator({} as any, mockSupabase, '/tmp', undefined, undefined);
}

describe('BlogGenerator.getDraftById', () => {
  beforeEach(() => { draftRow = null; updatedRow = null; updatedId = null; });

  it('mapeia a linha do banco pro BlogDraft (content_md -> contentMd)', async () => {
    draftRow = {
      id: 'draft_9', slug: 'x', title: 'T', description: 'd', category: 'tecnico',
      content_md: '# texto', generated_at: new Date(0).toISOString(), status: 'pending',
      hero_image_url: 'http://img/x.jpg',
    };
    const d = await makeGen().getDraftById('draft_9');
    expect(d?.id).toBe('draft_9');
    expect(d?.contentMd).toBe('# texto');
    expect(d?.heroImageUrl).toBe('http://img/x.jpg');
  });

  it('devolve null quando não acha', async () => {
    draftRow = null;
    expect(await makeGen().getDraftById('nada')).toBeNull();
  });
});

describe('BlogGenerator.updateDraftFields', () => {
  beforeEach(() => { draftRow = null; updatedRow = null; updatedId = null; });

  it('salva título e conteúdo (mapeando contentMd -> content_md)', async () => {
    await makeGen().updateDraftFields('draft_9', { title: 'Novo', contentMd: 'novo texto' });
    expect(updatedId).toBe('draft_9');
    expect(updatedRow).toMatchObject({ title: 'Novo', content_md: 'novo texto' });
  });

  it('não atualiza nada se nenhum campo vier', async () => {
    await makeGen().updateDraftFields('draft_9', {});
    expect(updatedRow).toBeNull();
  });
});
