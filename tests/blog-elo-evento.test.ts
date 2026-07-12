// Elo — a casa "Blog" na espinha do event-stream.
// Verifica que ao PUBLICAR um post com sucesso (markPublished), o BlogGenerator
// registra um evento em `eventos_elo` com tipo 'marketing:blog_publicado'.
import { describe, it, expect, beforeEach } from 'vitest';
import { BlogGenerator } from '../src/modules/blog-generator.js';

let publishedRow: { id: string; slug: string; title: string } | null = null;
let eventoInserido: Record<string, unknown> | null = null;

const mockSupabase = {
  from: (table: string) => {
    if (table === 'eventos_elo') {
      return {
        insert: async (row: Record<string, unknown>) => {
          eventoInserido = row;
          return { error: null };
        },
      };
    }
    // blog_drafts
    return {
      update: (_row: Record<string, unknown>) => ({
        eq: (_c: string, _id: string) => ({
          select: (_cols: string) => ({
            maybeSingle: async () => ({ data: publishedRow, error: null }),
          }),
        }),
      }),
    };
  },
} as any;

function makeGen() {
  return new BlogGenerator({} as any, mockSupabase, '/tmp', undefined, undefined);
}

describe('BlogGenerator.markPublished → Elo', () => {
  beforeEach(() => {
    publishedRow = null;
    eventoInserido = null;
  });

  it('registra evento marketing:blog_publicado ao publicar com sucesso', async () => {
    publishedRow = { id: 'draft_42', slug: 'meu-artigo', title: 'Meu Artigo Solar' };

    await makeGen().markPublished('draft_42');

    expect(eventoInserido).not.toBeNull();
    expect(eventoInserido).toMatchObject({
      tipo: 'marketing:blog_publicado',
      departamento: 'marketing',
      canal: 'sistema',
      origem: 'blog',
    });
    expect(eventoInserido?.payload).toMatchObject({
      titulo: 'Meu Artigo Solar',
      slug: 'meu-artigo',
      id: 'draft_42',
    });
  });
});
