// Tela "Revisar rascunho": ler conteúdo + editar + ver/buscar foto + publicar.
import { describe, it, expect } from 'vitest';
import { renderBlogRevisarPage, renderBlogDraftsPage } from '../src/modules/dashboard/blog-views.js';

const base = {
  id: 'draft_1', slug: 'meu-post', title: 'Meu Título', description: 'resumo aqui',
  category: 'tecnico', tags: ['solar'], contentMd: '# Conteúdo\ntexto do post aqui',
  readingTime: 4, generatedAt: new Date(0).toISOString(), status: 'pending',
} as any;

describe('renderBlogRevisarPage', () => {
  it('mostra o título editável num input', () => {
    expect(renderBlogRevisarPage(base)).toContain('value="Meu Título"');
  });

  it('mostra o conteúdo num textarea editável', () => {
    const html = renderBlogRevisarPage(base);
    expect(html).toContain('name="contentMd"');
    expect(html).toContain('texto do post aqui');
  });

  it('tem botões de buscar foto, salvar, editar e publicar', () => {
    const html = renderBlogRevisarPage(base);
    expect(html).toContain('/draft_1/foto');
    expect(html).toContain('/draft_1/editar');
    expect(html).toContain('/draft_1/publicar');
  });

  it('SEM foto: mostra aviso e botão "Buscar foto"', () => {
    const html = renderBlogRevisarPage(base);
    expect(html).toContain('Sem foto ainda');
    expect(html).toContain('Buscar foto');
  });

  it('COM foto: mostra a imagem e o botão "Trocar foto"', () => {
    const html = renderBlogRevisarPage({ ...base, heroImageUrl: 'https://img.pexels.com/x.jpg' });
    expect(html).toContain('src="https://img.pexels.com/x.jpg"');
    expect(html).toContain('Trocar foto');
  });
});

describe('renderBlogDraftsPage — card ganhou o botão Revisar', () => {
  it('cada rascunho tem link de Revisar/editar', () => {
    const html = renderBlogDraftsPage([base]);
    expect(html).toContain('/draft_1/revisar');
    expect(html).toContain('Revisar');
  });
});
