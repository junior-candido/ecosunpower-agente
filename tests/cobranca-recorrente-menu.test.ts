// Cobrança recorrente no MENU: "tudo no /menu" (a Eva tem o botão
// "Mensalidades" no Financeiro) e, no painel, "Assinaturas" fica perto de
// "Cobrar cliente" — e SÓ para a casa (tenant não vê a carteira dos outros).
import { describe, it, expect, vi } from 'vitest';
import { construirMenu, rowsSubmenu, MAX_ROWS_LISTA, type MenuDeps } from '../src/modules/menu/menu.js';
import { MENU_AREAS } from '../src/modules/dashboard/menu-areas.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { textoResumoMensalidades } from '../src/modules/cobranca-recorrente/mensagens.js';
import { USER_CASA, USER_TENANT } from './fixtures/miolo-leads.js';

function depsStub(): MenuDeps {
  const h = () => vi.fn(async () => true);
  const a = () => vi.fn(async () => {});
  return {
    pricing: h(), proposal: h(), closing: h(), creative: h(), banner: h(),
    bannerKits: h(), reativarBase: h(), juniorBlog: h(), scheduling: h(),
    caseCreator: h(), testimonialAdmin: h(), relatorio: h(), caixa: h(), resgatarForms: h(),
    googleAds: h(), campanha: h(), acaoImposto: a(), acaoApagar: a(), acaoGerarPost: a(), acaoFecheiVenda: a(),
    acaoMensalidades: a(),
  };
}

describe('/menu da Eva — Financeiro › Mensalidades', () => {
  it('o botão existe, chama a ação e o submenu cabe na lista do WhatsApp', () => {
    const deps = depsStub();
    const fin = construirMenu(deps).find((c) => c.id === 'financeiro')!;
    const item = fin.items.find((i) => i.id === 'menu_fin_mensalidades');
    expect(item).toBeDefined();
    expect(item!.action).toBe(deps.acaoMensalidades);
    expect(item!.title.length).toBeLessThanOrEqual(24);
    expect(item!.description.length).toBeLessThanOrEqual(72);
    expect(rowsSubmenu(fin).length).toBeLessThanOrEqual(MAX_ROWS_LISTA);
  });
});

describe('textoResumoMensalidades (resposta do botão)', () => {
  it('total do mês, atrasadas com dias e o que vence nos próximos dias', () => {
    const t = textoResumoMensalidades({
      resumo: { recorrenteCentavos: 29700, ativas: 1, recebidoMesCentavos: 0, emAbertoCentavos: 29700, atrasadas: 1 },
      atrasadas: [{ nome: 'Jimena Pereira Fonseca', valorCentavos: 29700, dias: 4 }],
      proximas: [{ nome: 'Cliente Exemplo', valorCentavos: 15000, venceEm: '2026-10-12' }],
      painelUrl: 'https://painel.exemplo.invalid/dashboard/assinaturas',
    });
    expect(t).toContain('R$ 297,00');
    expect(t).toContain('Jimena Pereira Fonseca');
    expect(t).toContain('4 dias');
    expect(t).toContain('12/10');
    expect(t).toContain('https://painel.exemplo.invalid/dashboard/assinaturas');
  });
  it('sem nada atrasado diz que está tudo em dia', () => {
    const t = textoResumoMensalidades({
      resumo: { recorrenteCentavos: 0, ativas: 0, recebidoMesCentavos: 0, emAbertoCentavos: 0, atrasadas: 0 },
      atrasadas: [], proximas: [], painelUrl: null,
    });
    expect(t).toMatch(/em dia/);
  });
});

describe('menu do painel — Assinaturas', () => {
  it('fica no grupo Financeiro, logo depois de Cobrar cliente, e é só da casa', () => {
    const fin = MENU_AREAS.find((g) => g.id === 'financeiro')!;
    const keys = fin.itens.map((i) => i.key);
    expect(keys.indexOf('assinaturas')).toBe(keys.indexOf('cobrar') + 1);
    expect(fin.itens.find((i) => i.key === 'assinaturas')).toMatchObject({ soEcosun: true, area: 'financeiro' });
  });
  it('casa vê o link; tenant (mesmo com financeiro) NÃO', () => {
    expect(renderLayout({ active: 'financeiro', title: 'X', body: '', user: USER_CASA })).toContain('href="/dashboard/assinaturas"');
    const tenantComFin = { ...USER_TENANT, isAdmin: true, modulosContratados: ['financeiro'] } as any;
    expect(renderLayout({ active: 'financeiro', title: 'X', body: '', user: tenantComFin })).not.toContain('href="/dashboard/assinaturas"');
  });
});
