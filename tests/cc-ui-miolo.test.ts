// Renovação do miolo — R1: peças novas do design system (28/09/2026).
// Todas puras, escapadas, sem número inventado ("—" quando falta dado).
import { describe, it, expect } from 'vitest';
import {
  botao, abas, chip, chipsFiltro, celulaDupla, barra, aviso, paginacao, linhaLista,
  menuAcoes, avatar, trilhaEtapas, tabela,
} from '../src/modules/dashboard/ui/componentes.js';
import { pilulaEtapa, pilulaEtapaObra } from '../src/modules/dashboard/ui/etapas.js';
import { colunaKanban, cartaoKanban } from '../src/modules/dashboard/ui/kanban.js';
import { JS_TEMA_GRAFICOS } from '../src/modules/dashboard/ui/graficos.js';
import { temaDaTela } from '../src/modules/dashboard/ui/tema.js';
import { CSS_DESIGN_SYSTEM } from '../src/modules/dashboard/ui/estilo.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { ORDEM_ETAPAS } from '../src/modules/dashboard/pipeline.js';
import { ETAPAS_USINA } from '../src/modules/usina-etapas.js';
import { contratoDaTela } from './helpers/contrato-tela.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

describe('botao', () => {
  it('href perigoso (javascript:) some', () => {
    const h = botao({ rotulo: 'X', href: 'javascript:alert(1)' });
    expect(h).not.toContain('javascript:');
    expect(h).not.toContain('href=');
  });
  it('link interno vira <a class="cc-btn">', () => {
    expect(botao({ rotulo: 'Abrir', href: '/dashboard/leads' })).toBe('<a class="cc-btn" href="/dashboard/leads">Abrir</a>');
  });
  it('submit gera <button type="submit">', () => {
    expect(botao({ rotulo: 'Salvar', tipo: 'submit' })).toMatch(/^<button type="submit" class="cc-btn"[^>]*>Salvar<\/button>$/);
  });
  it('tom ouro → cc-btn-gold; crítico → cc-btn-crit; fantasma → cc-btn-ghost; tamanho sm', () => {
    expect(botao({ rotulo: 'A', tipo: 'submit', tom: 'ouro' })).toContain('class="cc-btn cc-btn-gold"');
    expect(botao({ rotulo: 'A', tipo: 'submit', tom: 'critico' })).toContain('cc-btn-crit');
    expect(botao({ rotulo: 'A', tipo: 'submit', tom: 'fantasma', tamanho: 'sm' })).toContain('class="cc-btn cc-btn-ghost cc-btn-sm"');
  });
  it('rótulo e atributos escapados; name/value do botão preservados', () => {
    const h = botao({ rotulo: '<b>x</b>', tipo: 'submit', nome: 'modo', valor: 'atualizar', attrs: { onclick: "a('b')" } });
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(h).toContain('name="modo"');
    expect(h).toContain('value="atualizar"');
    expect(h).toContain('onclick="a(&#039;b&#039;)"');
  });
  it('atributo com nome inválido é descartado', () => {
    expect(botao({ rotulo: 'A', tipo: 'button', attrs: { 'x" onmouseover="y': '1' } })).not.toContain('onmouseover');
  });
});

describe('abas', () => {
  it('item ativo com aria-current="page"; selo 0 some', () => {
    const h = abas({ itens: [
      { rotulo: 'Visão geral', href: '#visao', ativo: true, selo: 0 },
      { rotulo: 'Dados', href: '#dados', selo: 3 },
    ] });
    expect(h).toMatch(/<a class="cc-aba cc-aba-on" href="#visao" aria-current="page">Visão geral<\/a>/);
    expect(h).toContain('>3</span>');
    expect(h).not.toMatch(/Visão geral<span/);
  });
  it('âncora e link interno aceitos; javascript: vira #', () => {
    expect(abas({ itens: [{ rotulo: 'X', href: 'javascript:1' }] })).not.toContain('javascript');
  });
});

describe('chip / chipsFiltro', () => {
  it('ativo → cc-chip-on', () => {
    expect(chip({ rotulo: 'Todos', href: '/dashboard/leads', ativo: true })).toContain('class="cc-chip cc-chip-on"');
  });
  it('contagem 0 aparece como "0"; null → sem número', () => {
    expect(chip({ rotulo: 'Novos', valor: 0, href: '/x' })).toContain('<b>0</b>');
    expect(chip({ rotulo: 'Novos', valor: null, href: '/x' })).not.toContain('<b>');
  });
  it('rótulo escapado e href preservado com parâmetros', () => {
    const h = chip({ rotulo: '<i>', valor: 2, href: '/dashboard/leads?status=novo&q=a%20b' });
    expect(h).toContain('&lt;i&gt;');
    expect(h).toContain('href="/dashboard/leads?status=novo&amp;q=a%20b"');
  });
  it('chipsFiltro embrulha numa linha rolável', () => {
    expect(chipsFiltro([{ rotulo: 'A', href: '/a' }])).toMatch(/^<div class="cc-chips cc-chips-rolar">/);
  });
});

describe('celulaDupla', () => {
  it('título + linha de baixo, escapados; com link quando href', () => {
    const h = celulaDupla('Ana <x>', 'Cidade & Co', '/dashboard/leads/1');
    expect(h).toContain('<a class="cc-dupla-t" href="/dashboard/leads/1">Ana &lt;x&gt;</a>');
    expect(h).toContain('<span class="cc-dupla-s">Cidade &amp; Co</span>');
  });
  it('sem sub → só o título; sem título → —', () => {
    expect(celulaDupla('A')).not.toContain('cc-dupla-s');
    expect(celulaDupla(null)).toContain('—');
  });
});

describe('barra', () => {
  it('−5 → 0 %, 140 → 100 %, null → "—"', () => {
    expect(barra(-5)).toContain('width:0%');
    expect(barra(140)).toContain('width:100%');
    expect(barra(null)).toContain('—');
    expect(barra(null)).not.toContain('cc-bar');
  });
  it('tom muda a cor; arredonda', () => {
    expect(barra(42.4, 'crit')).toContain('cc-bar-crit');
    expect(barra(42.4)).toContain('width:42%');
  });
});

describe('aviso', () => {
  it('tom e texto escapado; erro com role="alert"', () => {
    const h = aviso({ tom: 'erro', texto: '<script>x</script>' });
    expect(h).toContain('cc-aviso-erro');
    expect(h).toContain('role="alert"');
    expect(h).not.toContain('<script>');
    expect(aviso({ tom: 'ok', texto: 'Salvo' })).toContain('role="status"');
  });
});

describe('paginacao', () => {
  const hrefDe = (offset: number) => `/dashboard/leads?offset=${offset}`;
  it('página 1 sem "anterior"', () => {
    const h = paginacao({ pagina: 1, totalPaginas: 3, limite: 50, hrefDe });
    expect(h).not.toContain('rel="prev"');
    expect(h).toContain('href="/dashboard/leads?offset=50" rel="next"');
  });
  it('hrefDe recebe o offset certo', () => {
    const h = paginacao({ pagina: 3, totalPaginas: 5, limite: 10, hrefDe });
    expect(h).toContain('href="/dashboard/leads?offset=10" rel="prev"');
    expect(h).toContain('href="/dashboard/leads?offset=30" rel="next"');
    expect(h).toContain('Página 3 de 5');
  });
  it('última página sem "próxima"; total 1 → vazio', () => {
    expect(paginacao({ pagina: 5, totalPaginas: 5, limite: 10, hrefDe })).not.toContain('rel="next"');
    expect(paginacao({ pagina: 1, totalPaginas: 1, limite: 10, hrefDe })).toBe('');
  });
  it('resumo escapado', () => {
    expect(paginacao({ pagina: 2, totalPaginas: 2, limite: 10, hrefDe, resumo: 'Mostrando 11–12 de 12' })).toContain('Mostrando 11–12 de 12');
  });
});

describe('linhaLista', () => {
  it('bolinha do tom, título/meta escapados, direita confiável, link opcional', () => {
    const h = linhaLista({ tom: 'atencao', titulo: 'Conta <x>', meta: 'vence 02/10', direitaHtml: '<b class="cc-n">R$ 1</b>', href: '/dashboard/financeiro' });
    expect(h).toContain('cc-d-warn');
    expect(h).toContain('Conta &lt;x&gt;');
    expect(h).toContain('<b class="cc-n">R$ 1</b>');
    expect(h).toMatch(/^<a class="cc-li" href="\/dashboard\/financeiro">/);
  });
});

describe('menuAcoes', () => {
  it('<details> sem JavaScript; conteúdo HTML confiável passado inteiro', () => {
    const forms = '<form method="POST" action="/dashboard/leads/1/arquivar" onsubmit="return confirm(\'Arquivar?\')"><button>Arquivar</button></form>';
    const h = menuAcoes({ itensHtml: forms });
    expect(h).toMatch(/^<details class="cc-mais">/);
    expect(h).toContain(forms);
    expect(h).toContain('Mais ações');
    expect(h).not.toContain('<script');
  });
  it('rótulo próprio escapado', () => {
    expect(menuAcoes({ rotulo: '<x>', itensHtml: '' })).toContain('&lt;x&gt;');
  });
});

describe('avatar', () => {
  it('inicial maiúscula; vazio → ?', () => {
    expect(avatar('ana souza')).toContain('>A<');
    expect(avatar('')).toContain('>?<');
    expect(avatar(null)).toContain('>?<');
    expect(avatar('<b>')).toContain('&lt;');
  });
});

describe('trilhaEtapas', () => {
  const et = ['Contrato', 'Projeto', 'Homologação', 'Instalação'];
  it('marca feitas, atual e futuras', () => {
    const h = trilhaEtapas(et, 1);
    expect((h.match(/cc-trl-feita/g) ?? []).length).toBe(1);
    expect(h).toContain('cc-trl-atual');
    expect(h).toContain('aria-current="step"');
  });
  it('índice fora do intervalo não quebra', () => {
    expect(() => trilhaEtapas(et, -3)).not.toThrow();
    expect(() => trilhaEtapas(et, 99)).not.toThrow();
    expect(trilhaEtapas(et, 99)).not.toContain('cc-trl-atual');
    expect((trilhaEtapas(et, 99).match(/cc-trl-feita/g) ?? []).length).toBe(4);
    expect(trilhaEtapas([], 0)).toBe('');
  });
});

describe('tabela — extensão mobile compatível', () => {
  const entrada = {
    colunas: [{ titulo: 'Usina <x>' }, { titulo: 'kWp', alinhar: 'dir' as const, num: true, casas: 1 }, { titulo: 'Status' }],
    linhas: [['Casa "A"', 5.5, { html: '<span class="cc-pill">ok</span>' }], [null, 12, 'b&c']] as any,
    hrefs: ['/dashboard/monitoramento/1', null],
  };
  it('sem `mobile` → igual byte a byte à de hoje', () => {
    expect(tabela(entrada)).toBe('<div class="cc-tbl-wrap"><table class="cc-tbl"><thead><tr><th>Usina &lt;x&gt;</th><th class="cc-r">kWp</th><th>Status</th></tr></thead><tbody><tr class="cc-tr-link" data-href="/dashboard/monitoramento/1" onclick="location.href=this.dataset.href"><td>Casa &quot;A&quot;</td><td class="cc-r cc-n">5,5</td><td><span class="cc-pill">ok</span></td></tr><tr><td>—</td><td class="cc-r cc-n">12,0</td><td>b&amp;c</td></tr></tbody></table></div>');
  });
  it('mobile:"cartoes" → cada <td> com data-label do título escapado', () => {
    const h = tabela({ ...entrada, mobile: 'cartoes' });
    expect(h).toContain('class="cc-tbl-wrap cc-tbl-cartoes"');
    expect(h).toContain('<td data-label="Usina &lt;x&gt;">');
    expect(h).toContain('<td class="cc-r cc-n" data-label="kWp">');
  });
  it('mobile:"rolar" → só a tabela rola', () => {
    const h = tabela({ ...entrada, mobile: 'rolar' });
    expect(h).toContain('class="cc-tbl-wrap cc-tbl-rolar"');
    expect(h).not.toContain('data-label');
  });
  it('CSS dos cartões e da rolagem existe', () => {
    expect(CSS_DESIGN_SYSTEM).toContain('.cc-tbl-cartoes');
    expect(CSS_DESIGN_SYSTEM).toContain('attr(data-label)');
    expect(CSS_DESIGN_SYSTEM).toContain('.cc-tbl-rolar');
  });
});

describe('pilulaEtapa / pilulaEtapaObra', () => {
  it('toda etapa do funil (pipeline.ts) tem cor própria, e perdido também', () => {
    for (const e of [...ORDEM_ETAPAS, 'perdido']) {
      const h = pilulaEtapa(e);
      expect(h).toContain(`cc-et-${e}`);
      expect(CSS_DESIGN_SYSTEM).toContain(`.cc-et-${e}{`);
    }
  });
  it('rótulo em português vem do pipeline.ts', () => {
    expect(pilulaEtapa('proposta_enviada')).toContain('>Proposta enviada<');
  });
  it('etapa desconhecida → pílula neutra com o texto escapado (nunca quebra)', () => {
    const h = pilulaEtapa('<script>x</script>');
    expect(h).toContain('cc-et-outra');
    expect(h).not.toContain('<script>');
    expect(pilulaEtapa(null)).toContain('—');
  });
  it('toda etapa de obra (usina-etapas.ts) tem cor', () => {
    for (const e of ETAPAS_USINA) {
      expect(pilulaEtapaObra(e.slug)).toContain(`cc-eo-${e.slug}`);
      expect(pilulaEtapaObra(e.slug)).toContain(e.label);
      expect(CSS_DESIGN_SYSTEM).toContain(`.cc-eo-${e.slug}{`);
    }
    expect(pilulaEtapaObra('xyz')).toContain('cc-et-outra');
  });
});

describe('kanban', () => {
  it('cartão mantém a classe-gancho e o data-* do chamador, nome escapado', () => {
    const h = cartaoKanban({ classe: 'kanban-card', dados: { 'lead-id': 'abc' }, titulo: 'Ana <x>', href: '/dashboard/leads/abc', tom: 'critico', metaHtml: '<span>2d</span>' });
    expect(h).toContain('class="cc-kb-card cc-kb-crit kanban-card"');
    expect(h).toContain('data-lead-id="abc"');
    expect(h).toContain('Ana &lt;x&gt;');
    expect(h).toContain('href="/dashboard/leads/abc" draggable="false"');
  });
  it('coluna com título, contagem e a lista com classe/data do Sortable; vazia mostra aviso curto', () => {
    const h = colunaKanban({ titulo: 'Novo', contagem: 0, classeLista: 'kanban-list', dados: { etapa: 'novo' }, cartoesHtml: '' });
    expect(h).toContain('class="cc-kb-lista kanban-list" data-etapa="novo"');
    expect(h).toContain('<span class="cc-kb-n">0</span>');
    expect(h).toContain('cc-kb-vazio');
  });
  it('data-* com nome inválido é descartado', () => {
    expect(cartaoKanban({ classe: 'x', dados: { 'a"b': '1' }, titulo: 'T' })).not.toContain('a"b');
  });
  it('CSS do kanban com encaixe no celular', () => {
    expect(CSS_DESIGN_SYSTEM).toContain('.cc-kb{');
    expect(CSS_DESIGN_SYSTEM).toContain('scroll-snap-type');
  });
});

describe('formulário .cc-form', () => {
  it('estiliza input/select/textarea sem trocar o HTML; 44 px e fonte 16 px no celular', () => {
    expect(CSS_DESIGN_SYSTEM).toMatch(/\.cc-form input/);
    expect(CSS_DESIGN_SYSTEM).toMatch(/\.cc-form select/);
    expect(CSS_DESIGN_SYSTEM).toMatch(/\.cc-form textarea/);
    const cel = CSS_DESIGN_SYSTEM.slice(CSS_DESIGN_SYSTEM.lastIndexOf('/* form celular */'));
    expect(cel).toContain('min-height:44px');
    expect(cel).toContain('font-size:16px');
  });
});

describe('JS_TEMA_GRAFICOS', () => {
  it('lê os tokens --cc-* e aplica em Chart.js e num tema ECharts "cc"', () => {
    expect(JS_TEMA_GRAFICOS).toContain('getComputedStyle');
    expect(JS_TEMA_GRAFICOS).toContain('--cc-text');
    expect(JS_TEMA_GRAFICOS).toContain('Chart.defaults');
    expect(JS_TEMA_GRAFICOS).toContain("registerTheme('cc'");
    expect(JS_TEMA_GRAFICOS).toMatch(/^<script id="cc-tema-graficos">/);
  });
  it('roda sem Chart e sem echarts na página (não quebra)', () => {
    const corpo = JS_TEMA_GRAFICOS.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    const win: Record<string, unknown> = {};
    const doc = { querySelector: () => null, documentElement: {} };
    const gcs = () => ({ getPropertyValue: () => ' #123456 ' });
    expect(() => new Function('window', 'document', 'getComputedStyle', corpo)(win, doc, gcs)).not.toThrow();
    expect((win as any).ccTema.text).toBe('#123456');
  });
});

// TROCA DELIBERADA (28/09, decisão D4 do Junior = (a) "todas escuras", junto
// com a tela de Atendimento): antes a D4 estava em aberto e temaDaTela devolvia
// o padrão de cada tela ('claro' em Leads/ficha/Funil). Agora toda tela
// renovada abre ESCURA, EcoSun e tenant (o padrão da tela não manda mais).
describe('temaDaTela (D4 decidida = (a): todas escuras)', () => {
  const casa: DashUser = { id: '1', companyId: '00000000-0000-0000-0000-000000000001', nome: 'J', login: 'j', isAdmin: true, roleNome: '', permissoes: {} };
  const tenant: DashUser = { ...casa, id: '2', companyId: 'aaaa1111-2222-3333-4444-555566667777' };
  it('EcoSun, tenant e tela sem usuário recebem o tema escuro', () => {
    expect(temaDaTela(casa, 'escuro')).toBe('escuro');
    expect(temaDaTela(casa, 'claro')).toBe('escuro');
    expect(temaDaTela(tenant, 'escuro')).toBe('escuro');
    expect(temaDaTela(tenant, 'claro')).toBe('escuro');
    expect(temaDaTela(undefined, 'claro')).toBe('escuro');
  });
});

describe('renderLayout({ imersivo })', () => {
  it('sem rodapé e com a área cheia; sem a opção, igual a hoje', () => {
    const h = renderLayout({ active: 'predio', title: 'X', body: '<i>x</i>', user: undefined, imersivo: true, largo: true, dark: true });
    expect(h).toContain('class="cc-main cc-largo cc-imersivo"');
    expect(h).not.toContain('<footer class="cc-rodape">');
    const n = renderLayout({ active: 'home', title: 'X', body: '', user: undefined });
    expect(n).toContain('<footer class="cc-rodape">');
    expect(n).not.toContain('cc-imersivo"');
    expect(CSS_DESIGN_SYSTEM).toContain('.cc-main.cc-imersivo{');
  });
});

describe('contratoDaTela', () => {
  const pagina = `
    <form method="post" action="/dashboard/leads/1/tarefa"><input type="text" name="titulo" required><select name="prioridade"><option>a</option></select></form>
    <form action="/dashboard/leads" method="get" class="x"><input name="q"><button name="modo" value="nova">Ir</button></form>
    <a href="/dashboard/leads/1">x</a><a href="https://fora.com">y</a><a href="/dashboard/leads/1">de novo</a>
    <div id="ia-chat"></div>
    <form method="POST" action="/dashboard/leads/1/delete" onsubmit="return confirm('Remover?')"></form>
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"></script>
    <script>
      var c = document.getElementById('ia-chat');
      document.querySelectorAll('.kanban-list').forEach(function (x) { new Sortable(x, { draggable: '.kanban-card' }); });
      var id = evt.item.dataset.leadId;
      fetch('/dashboard/leads/' + id + '/ia-copiloto', { method: 'POST' });
      document.getElementById('sumiu');
    </script>`;

  it('extrai formulários, campos, fetches, links, ids, seletores, data-* e confirms', () => {
    expect(contratoDaTela(pagina)).toEqual({
      formularios: [
        { method: 'GET', action: '/dashboard/leads', enctype: '', campos: [{ name: 'modo', type: 'button:submit=nova' }, { name: 'q', type: 'text' }] },
        { method: 'POST', action: '/dashboard/leads/1/delete', enctype: '', campos: [] },
        { method: 'POST', action: '/dashboard/leads/1/tarefa', enctype: '', campos: [{ name: 'prioridade', type: 'select' }, { name: 'titulo', type: 'text' }] },
      ],
      fetches: ["'/dashboard/leads/' + id + '/ia-copiloto'"],
      links: ['/dashboard/leads/1'],
      ids: ['ia-chat', 'sumiu'],
      idsAusentes: ['sumiu'],
      seletores: ['.kanban-list', 'draggable:.kanban-card'],
      dataAttrs: ['data-lead-id'],
      confirms: ["'Remover?'"],
      scriptsExternos: ['https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js'],
    });
  });

  it('a ordem dos atributos e dos blocos não muda o resultado', () => {
    const b = pagina
      .replace('<form method="post" action="/dashboard/leads/1/tarefa">', '<form action="/dashboard/leads/1/tarefa" class="cc-form" method="post">')
      .replace('<input type="text" name="titulo" required>', '<input required name="titulo" type="text" class="y">');
    const partes = b.split('<div id="ia-chat"></div>');
    const trocada = `<div class="cc-panel" id="ia-chat"></div>${partes[1]}${partes[0]}`;
    expect(contratoDaTela(trocada)).toEqual(contratoDaTela(pagina));
  });

  it('entidade HTML no atributo (&amp;) é o mesmo link que & cru', () => {
    const cru = contratoDaTela('<a href="/dashboard/leads?status=novo&q=a">x</a><button onclick="return confirm(\'Tem certeza?\')">y</button>');
    const esc = contratoDaTela('<a href="/dashboard/leads?status=novo&amp;q=a">x</a><button onclick="return confirm(&#039;Tem certeza?&#039;)">y</button>');
    expect(esc).toEqual(cru);
  });

  it('mudar name, action ou confirm muda o contrato', () => {
    expect(contratoDaTela(pagina.replace('name="titulo"', 'name="title"'))).not.toEqual(contratoDaTela(pagina));
    expect(contratoDaTela(pagina.replace('/1/delete', '/1/apagar'))).not.toEqual(contratoDaTela(pagina));
    expect(contratoDaTela(pagina.replace("'Remover?'", "'Apagar?'"))).not.toEqual(contratoDaTela(pagina));
  });
});
