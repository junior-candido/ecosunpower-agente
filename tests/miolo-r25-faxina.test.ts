// Renovação do miolo — R25: faxina.
//  - /cockpit redireciona pro Command Center (o antigo só com ?antigo=1, só casa);
//  - nenhuma tela renovada manda <style> no corpo (sobe pro <head>: sem piscada);
//  - teto das telas que AINDA carregam o Tailwind do CDN (a lista só pode diminuir);
//  - o CSS legado da casca (.ecosun-header, .accent-*) NÃO saiu: um teste antigo
//    exige (telas-leves) e o plano só permite trocar asserção no R5/R23 — fica
//    anotado pro Junior decidir.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { CSS_PAINEL } from '../src/modules/dashboard/ui/estatico.js';
import { TELAS_RENOVADAS } from './helpers/teto-tailwind.js';
import { telasRenovadas } from './fixtures/telas-renovadas.js';
import { USER_CASA, USER_TENANT } from './fixtures/miolo-leads.js';

const DIR = join(process.cwd(), 'src', 'modules', 'dashboard');
const router = readFileSync(join(DIR, 'router.ts'), 'utf-8');

describe('/cockpit redireciona (o antigo só com ?antigo=1)', () => {
  it('GET /cockpit sem ?antigo=1 → entrada (Command Center); a trava da casa continua antes', () => {
    const i = router.indexOf("router.get('/cockpit', async");
    const trecho = router.slice(i, i + 600);
    expect(trecho).toContain("if (req.query.antigo !== '1') { res.redirect(302, paginaInicialDe((req as AuthedRequest).dashUser)); return; }");
    expect(router.indexOf("router.use('/cockpit', travaCockpitDaCasa)")).toBeLessThan(i);
  });
  it('/cockpit/data e o refresh dos insights ficam (a síntese da Eva ainda mora lá)', () => {
    expect(router).toContain("router.get('/cockpit/data'");
    expect(router).toContain("router.post('/cockpit/insights/refresh'");
  });
});

describe('sem <style> no corpo das telas renovadas (sobe pro <head>)', () => {
  for (const [quem, user] of [['casa', USER_CASA], ['tenant', USER_TENANT]] as const) {
    it(`todas as telas renovadas (${quem})`, () => {
      const comStyle = Object.entries(telasRenovadas(3, user))
        .filter(([, h]) => /<style[\s>]/i.test(h.slice(h.indexOf('<body'))))
        .map(([k]) => k);
      expect(comStyle).toEqual([]);
    });
  }
  it('renderLayout sobe os <style> do corpo na mesma ordem, depois do cabeca', () => {
    const h = renderLayout({ active: 'home', title: 'X', user: USER_CASA, tailwind: false, cabeca: '<style>.a{}</style>', body: '<div>oi</div><style>.b{}</style><p>x</p><style>.c{}</style>' });
    const head = h.slice(0, h.indexOf('</head>'));
    expect(head.indexOf('.a{}')).toBeLessThan(head.indexOf('.b{}'));
    expect(head.indexOf('.b{}')).toBeLessThan(head.indexOf('.c{}'));
    expect(h.slice(h.indexOf('<body'))).not.toContain('<style>');
    expect(h).toContain('<div>oi</div><p>x</p>');
  });
  it('tela antiga (com Tailwind) fica como estava (o Tailwind injeta o CSS dele no fim do <head>)', () => {
    const h = renderLayout({ active: 'home', title: 'X', user: USER_CASA, body: '<style>.b{}</style>' });
    expect(h.slice(h.indexOf('<body'))).toContain('<style>.b{}</style>');
  });
  it('texto de cliente escapado nunca vira <style>', () => {
    const h = renderLayout({ active: 'home', title: 'X', user: USER_CASA, tailwind: false, body: '<p>&lt;style&gt;x&lt;/style&gt;</p>' });
    expect(h).toContain('<p>&lt;style&gt;x&lt;/style&gt;</p>');
  });
});

/** Telas que AINDA carregam o Tailwind do CDN (miolo antigo). Esta lista só
 *  pode DIMINUIR: tela nova nasce no padrão cc- (tailwind:false, TELAS_RENOVADAS).
 *  - Financeiro II (R20 — fora da Onda 4: a cobrança recorrente mexe nessas telas);
 *  - Cockpit antigo (aposentado — só abre com ?antigo=1);
 *  - Propostas (lista e formulário: views.ts#renderPropostasPage e proposta-form-view.ts). */
const AINDA_COM_TAILWIND = ['assinaturas-views.ts', 'cockpit-views.ts', 'fiscal-views.ts', 'proposta-form-view.ts'];

describe('teto das telas com Tailwind do CDN', () => {
  it('só as da lista (e nenhuma renovada) ainda carregam o Tailwind', () => {
    const renovados = new Set(TELAS_RENOVADAS.map((t) => t.split('#')[0]));
    const comTw: string[] = [];
    for (const arq of readdirSync(DIR).filter((f) => f.endsWith('.ts') && f !== 'views.ts')) {
      const fonte = readFileSync(join(DIR, arq), 'utf-8');
      const chamadas = (fonte.match(/renderLayout\(\{/g) ?? []).length;
      const semTw = (fonte.match(/tailwind:\s*false/g) ?? []).length;
      if (chamadas > semTw) comTw.push(arq);
    }
    expect(comTw.sort()).toEqual(AINDA_COM_TAILWIND);
    for (const a of AINDA_COM_TAILWIND) expect(renovados.has(a), a).toBe(false);
  });
});

describe('casca', () => {
  it('o <body> continua com ecosun-body/ecosun-body-dark (cc-casca e monitoramento-render exigem)', () => {
    expect(renderLayout({ active: 'home', title: 'X', user: USER_CASA, body: '', dark: true })).toMatch(/<body class="[^"]*ecosun-body/);
  });
  it('CSS legado da casca continua (decisão pendente do Junior — teste antigo exige)', () => {
    expect(CSS_PAINEL).toContain('.ecosun-header');
  });
});
