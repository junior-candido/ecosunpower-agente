// 28/09 (Junior): a palavra "Kanban" some de TUDO que o usuário vê.
// Vendas = "Quadro de Vendas" · Obras = "Quadro de Obras". Rotas, ids,
// classes CSS e nomes internos (/leads/kanban, .kanban-card…) ficam iguais.
// Este teste falha se "Kanban" voltar ao texto visível do menu ou das telas.
import { describe, it, expect } from 'vitest';
import { MENU_AREAS } from '../src/modules/dashboard/menu-areas.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { renderLeadsListPage } from '../src/modules/dashboard/leads-views.js';
import { renderUsinasKanbanPage } from '../src/modules/dashboard/usinas-kanban-views.js';
import { renderAtendimentoPage } from '../src/modules/dashboard/atendimento-views.js';
import { CASOS_FUNIL } from './fixtures/casos-funil.js';
import { USER_CASA, USER_TENANT, LINHAS_LEADS, LISTA_CONVERSAS } from './fixtures/miolo-leads.js';

/** Só o texto que aparece na tela: sem <script>/<style>, sem tags e sem atributos (href, class, id). */
function textoVisivel(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<title\b[\s\S]*?<\/title>/gi, (t) => t.replace(/<\/?title[^>]*>/gi, ' '))
    .replace(/<[^>]+>/g, ' ');
}

describe('"Kanban" fora do texto visível', () => {
  it('menu: nenhum rótulo nem título de grupo com "Kanban"; nomes novos presentes', () => {
    const textos = MENU_AREAS.flatMap((g) => [g.titulo, g.tituloTenant ?? '', ...g.itens.map((i) => i.label)]);
    for (const t of textos) expect(t, t).not.toMatch(/kanban/i);
    expect(textos).toContain('Quadro de Vendas');
    expect(textos).toContain('Quadro de Obras');
  });

  it('menu desenhado (EcoSun e tenant) sem "Kanban" no texto', () => {
    for (const user of [USER_CASA, USER_TENANT, undefined]) {
      const h = renderLayout({ active: 'kanban', title: 'X', body: '', user });
      expect(textoVisivel(h)).not.toMatch(/kanban/i);
    }
  });

  it('telas: Leads, Quadro de Vendas, Quadro de Obras e Conversas sem "Kanban" no texto', () => {
    const telas = {
      leads: renderLeadsListPage(LINHAS_LEADS, { total: 4 }, USER_CASA),
      vendas: CASOS_FUNIL.cheio(),
      obras: renderUsinasKanbanPage([], USER_CASA),
      obrasTenant: renderUsinasKanbanPage([], USER_TENANT),
      conversas: renderAtendimentoPage({ user: USER_TENANT, lista: LISTA_CONVERSAS, filtros: {}, lead: null }),
    };
    for (const [nome, h] of Object.entries(telas)) expect(textoVisivel(h), nome).not.toMatch(/kanban/i);
    expect(textoVisivel(telas.vendas)).toContain('Quadro de Vendas');
    expect(textoVisivel(telas.obras)).toContain('Quadro de Obras');
    // as rotas continuam as mesmas
    expect(telas.leads).toContain('href="/dashboard/leads/kanban"');
  });
});
