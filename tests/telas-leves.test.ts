// Telas mais leves (perf/telas-leves, 28/09/2026).
// O dono disse que a lista de Leads estava "pesada" e a automação do Chrome
// chegava a congelar. Cada página levava ~280 KB de HTML: a logo embutida em
// base64 DUAS vezes (~108 KB cada), ~33 KB de CSS do design system repetido e o
// Tailwind do CDN (~400 KB de JS que compila no navegador) — até nas telas que
// já não usam Tailwind nenhum.
// Agora: logo e CSS comum viram ARQUIVO (nome com hash, cache longo) e as telas
// renovadas (mesma lista do teto do Tailwind) não carregam mais o Tailwind.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { renderLayout } from '../src/modules/dashboard/views.js';
import {
  URL_CSS_PAINEL, URL_CSS_SEM_TAILWIND, URL_LOGO_CASA, CSS_PAINEL, CSS_SEM_TAILWIND, servirEstatico,
} from '../src/modules/dashboard/ui/estatico.js';
import { CSS_DESIGN_SYSTEM } from '../src/modules/dashboard/ui/estilo.js';
import { LOGO_NEGATIVA_WIDE_BASE64 } from '../src/modules/dashboard/ui/logo-negativa-wide.js';
import { carregarEmpresaConfig, comEmpresaDe, _resetEstadoParaTeste } from '../src/modules/empresa-config.js';
import { TELAS_RENOVADAS } from './helpers/teto-tailwind.js';
import { telasRenovadas } from './fixtures/telas-renovadas.js';
import { USER_CASA, USER_TENANT } from './fixtures/miolo-leads.js';

const TAILWIND = 'cdn.tailwindcss.com';

describe('arquivos estáticos do painel (nome com hash)', () => {
  it('URLs versionadas por hash do conteúdo, debaixo de /dashboard/estatico/', () => {
    expect(URL_CSS_PAINEL).toMatch(/^\/dashboard\/estatico\/painel\.[0-9a-f]{10}\.css$/);
    expect(URL_CSS_SEM_TAILWIND).toMatch(/^\/dashboard\/estatico\/sem-tailwind\.[0-9a-f]{10}\.css$/);
    expect(URL_LOGO_CASA).toMatch(/^\/dashboard\/estatico\/logo-casa\.[0-9a-f]{10}\.png$/);
  });

  it('o CSS do painel é o design system inteiro (+ classes antigas da casca)', () => {
    expect(CSS_PAINEL).toContain(CSS_DESIGN_SYSTEM);
    expect(CSS_PAINEL).toContain('.accent-amber');
    expect(CSS_PAINEL).toContain('.ecosun-header');
  });

  it('o CSS "sem Tailwind" traz o reset (preflight) e as 2 utilidades que a casca e os modais usam', () => {
    expect(CSS_SEM_TAILWIND).toContain('box-sizing:border-box');
    expect(CSS_SEM_TAILWIND).toMatch(/(^|[}\s])\.hidden\{display:none\}/);
    expect(CSS_SEM_TAILWIND).toMatch(/@media \(min-width:640px\)\{\.sm\\:inline\{display:inline\}\}/);
    // nada de theme() cru do Tailwind (vira CSS inválido no navegador)
    expect(CSS_SEM_TAILWIND).not.toContain('theme(');
  });

  describe('rota GET /dashboard/estatico/:arquivo', () => {
    let srv: Server; let base: string;
    beforeAll(async () => {
      const app = express();
      app.get('/dashboard/estatico/:arquivo', servirEstatico);
      srv = app.listen(0);
      await new Promise((ok) => srv.once('listening', ok));
      base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    });
    afterAll(() => { srv.close(); });

    it('CSS com o hash certo: tipo css + cache de 1 ano imutável', async () => {
      const r = await fetch(base + URL_CSS_PAINEL);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toMatch(/^text\/css/);
      expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await r.text()).toBe(CSS_PAINEL);
    });

    it('logo: PNG de verdade (os mesmos bytes da logo oficial embutida antes)', async () => {
      const r = await fetch(base + URL_LOGO_CASA);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('image/png');
      const bytes = Buffer.from(await r.arrayBuffer());
      expect(bytes.equals(Buffer.from(LOGO_NEGATIVA_WIDE_BASE64.split(',')[1], 'base64'))).toBe(true);
    });

    it('hash velho (página aberta antes do deploy): entrega o atual, mas SEM cache longo', async () => {
      const r = await fetch(`${base}/dashboard/estatico/painel.0000000000.css`);
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-cache');
      expect(await r.text()).toBe(CSS_PAINEL);
    });

    it('arquivo que não existe / nome fora do padrão → 404', async () => {
      for (const p of ['nada.0123456789.css', 'painel.css', '..%2Fviews.ts', 'painel.0123456789.js']) {
        expect((await fetch(`${base}/dashboard/estatico/${p}`)).status, p).toBe(404);
      }
    });
  });

  it('a rota é PÚBLICA (vem antes do login no router): a tela de login e o navegador buscam sem cookie', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
    const rota = fonte.indexOf("router.get('/estatico/:arquivo', servirEstatico)");
    expect(rota).toBeGreaterThan(-1);
    expect(rota).toBeLessThan(fonte.indexOf('router.use(criarSessionAuth(supabase))'));
  });
});

describe('renderLayout — sem data URI grande nem CSS comum embutido', () => {
  it('EcoSun: logo por URL (2 lugares: menu e barra do celular), nenhum data:image', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: USER_CASA });
    expect(h).not.toContain('data:image');
    expect(h.split(`src="${URL_LOGO_CASA}"`).length - 1).toBe(2);
    expect(h).toMatch(/<a href="\/dashboard\/home"[^>]*>\s*<img src="[^"]+" alt="EcoSunPower"/);
  });

  it('tenant sem logo: NUNCA recebe a logo da EcoSun (nem por URL)', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: USER_TENANT });
    expect(h).not.toContain(URL_LOGO_CASA);
    expect(h).not.toContain('logo-casa');
    expect(h).toContain('Solar Aurora Teste');
  });

  it('tenant com logo própria: vê a logo DELE (URL cadastrada), não a da casa', async () => {
    const linhas = [
      { company_id: USER_CASA.companyId, nome_fantasia: 'EcoSunPower' },
      { company_id: USER_TENANT.companyId, nome_fantasia: 'Solar Aurora Teste', logo_storage_path: 'https://exemplo.invalid/aurora.png' },
    ];
    const client = { from: () => ({ select: async () => ({ data: linhas, error: null }) }) } as never;
    try {
      await carregarEmpresaConfig(client);
      const h = comEmpresaDe(USER_TENANT.companyId, () => renderLayout({ active: 'home', title: 'X', body: '', user: USER_TENANT }));
      expect(h).toContain('src="https://exemplo.invalid/aurora.png"');
      expect(h).not.toContain(URL_LOGO_CASA);
      // e a casa, no mesmo processo, continua com a dela
      const c = comEmpresaDe(USER_CASA.companyId, () => renderLayout({ active: 'home', title: 'X', body: '', user: USER_CASA }));
      expect(c).toContain(URL_LOGO_CASA);
      expect(c).not.toContain('aurora.png');
    } finally {
      _resetEstadoParaTeste();
    }
  });

  it('CSS comum vem por <link> versionado; no HTML só fica a cor da marca (por empresa)', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: USER_CASA });
    expect(h).toContain(`<link rel="stylesheet" href="${URL_CSS_PAINEL}">`);
    expect(h).not.toContain('.cc-sb{');
    expect(h).not.toContain('--cc-bg:');
    expect(h).toMatch(/<style>\s*:root\s*\{\s*--marca:\s*#[0-9a-fA-F]{6};\s*\}\s*<\/style>/);
  });

  it('casca vazia pesa pouco (antes: ~260 KB)', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: USER_CASA });
    expect(Buffer.byteLength(h)).toBeLessThan(30 * 1024);
  });

  it('tela antiga (padrão) continua com o Tailwind do CDN e sem o CSS "sem Tailwind"', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: USER_CASA });
    expect(h).toContain(`<script src="https://${TAILWIND}"></script>`);
    expect(h).not.toContain(URL_CSS_SEM_TAILWIND);
  });

  it('tela com tailwind:false: sem o script do CDN e com o reset servido por arquivo, DEPOIS do CSS do painel', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: USER_CASA, tailwind: false });
    expect(h).not.toContain(TAILWIND);
    expect(h.indexOf(URL_CSS_SEM_TAILWIND)).toBeGreaterThan(h.indexOf(URL_CSS_PAINEL));
  });
});

describe('telas renovadas não carregam o Tailwind (e não precisam dele)', () => {
  const USERS = { casa: USER_CASA, tenant: USER_TENANT };

  for (const [quem, user] of Object.entries(USERS)) {
    for (const [nome, h] of Object.entries(telasRenovadas(20, user))) {
      it(`${nome} (${quem}): sem script do Tailwind, com o CSS do painel e o reset`, () => {
        expect(h).not.toContain(TAILWIND);
        expect(h).toContain(URL_CSS_PAINEL);
        expect(h).toContain(URL_CSS_SEM_TAILWIND);
        expect(h).not.toContain('data:image');
      });

      it(`${nome} (${quem}): toda classe fora do padrão cc- é conhecida (nada de Tailwind órfão)`, () => {
        // Classes permitidas fora do cc-: as do <body> (o design system já pinta o
        // fundo/texto — são inertes), ganchos de JS/CSS da própria tela e as 2
        // utilidades que o CSS "sem Tailwind" define (hidden, sm:inline).
        const CONHECIDAS = new Set([
          'ecosun-body', 'ecosun-body-dark', 'bg-slate-950', 'text-slate-100',
          'hidden', 'sm:inline',
          'kanban-board', 'kanban-col', 'kanban-list', 'kanban-card', 'sla-urgent',
          // Monitoramento (R8): ganchos da frota que os testes antigos procuram
          // (coluna-status, card-usina) e a Órbita (SVG com CSS da própria tela).
          'coluna-status', 'card-usina', 'orbita-frota', 'ponto-usina', 'sol-pulso', 'sol-central', 'anel',
        ]);
        // mu-* = Mapa das Usinas (#330): CSS próprio por arquivo (ui/mapa-cliente.ts).
        const corpo = h.slice(h.indexOf('<body'));
        const estranhas = new Set<string>();
        for (const m of corpo.matchAll(/class="([^"]*)"/g)) {
          for (const c of m[1].split(/\s+/)) if (c && !c.startsWith('cc-') && !c.startsWith('mu-') && !CONHECIDAS.has(c)) estranhas.add(c);
        }
        // classList mexido pelo JS da tela também precisa existir sem Tailwind.
        for (const m of corpo.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) {
          if (!m[1].startsWith('cc-') && !CONHECIDAS.has(m[1]) && m[1] !== 'sidebar-open') estranhas.add(m[1]);
        }
        expect([...estranhas]).toEqual([]);
      });
    }
  }

  it('lista de Leads com 50 linhas cabe em < 90 KB (antes: ~303 KB)', () => {
    expect(Buffer.byteLength(telasRenovadas(50).leads)).toBeLessThan(90 * 1024);
  });

  it('só as telas da lista do teto (TELAS_RENOVADAS) desligam o Tailwind — e todas elas desligam', () => {
    const dir = join(process.cwd(), 'src', 'modules', 'dashboard');
    const renovados = new Set(TELAS_RENOVADAS.map((t) => t.split('#')[0]));
    for (const arq of readdirSync(dir).filter((f: string) => f.endsWith('.ts'))) {
      const fonte = readFileSync(join(dir, arq), 'utf-8');
      const chamadas = (fonte.match(/renderLayout\(\{/g) ?? []).length;
      const semTw = (fonte.match(/tailwind:\s*false/g) ?? []).length;
      if (arq === 'views.ts') continue; // definição do layout
      if (renovados.has(arq)) expect(semTw, arq).toBe(chamadas);
      else expect(semTw, arq).toBe(0);
    }
  });
});

describe('Quadro de Vendas — pulso do SLA vermelho sem repintar a tela o tempo todo', () => {
  // Medido no Chrome headless: com 200 cartões (1/3 vermelhos) a animação de
  // box-shadow gastava ~1,5 s de CPU a cada 2 s PARADA (repinta todo quadro).
  // Agora o anel é fixo num ::after e só a OPACIDADE pulsa (a placa de vídeo faz).
  const h = telasRenovadas(10)['quadro-vendas'];
  const keyframes = (h.match(/@keyframes slaPulse\s*\{[\s\S]*?\}\s*\}/) ?? [''])[0];

  it('a animação não mexe em box-shadow (só opacity)', () => {
    expect(keyframes).toContain('opacity');
    expect(keyframes).not.toContain('box-shadow');
  });

  it('o anel vermelho continua lá (no ::after do cartão urgente) e respeita "reduzir movimento"', () => {
    expect(h).toMatch(/\.sla-urgent::after\s*\{[^}]*box-shadow:\s*0 0 0 3px rgba\(244,\s*63,\s*94,\s*0?\.35\)[^}]*animation:\s*slaPulse/);
    expect(h).toMatch(/\.sla-urgent\s*\{[^}]*position:\s*relative/);
    expect(h).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*\.sla-urgent::after\s*\{[^}]*animation:\s*none/);
    expect(h).toContain('class="cc-kb-card cc-kb-crit kanban-card sla-urgent"');
  });
});
