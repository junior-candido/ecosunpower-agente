// Mapa das Usinas — telas: bloco do Command Center, mini-mapa da usina e a
// página "Localizar usinas sem posição". Sem Tailwind (classes cc-), MapLibre
// com versão fixa + SRI, dado do usuário sempre escapado.
import { describe, it, expect } from 'vitest';
import {
  blocoMapaUsinas, blocoMiniMapaUsina, renderLocalizarUsinasPage, MAPLIBRE,
} from '../src/modules/dashboard/mapa-usinas-views.js';
import { renderCommandCenterPage } from '../src/modules/dashboard/command-center-views.js';
import { TODAS_PERMISSOES, NENHUM_MODULO } from '../src/modules/dashboard/command-center-queries.js';
import { URL_JS_MAPA_USINAS, URL_JS_MAPA_USINA, URL_CSS_MAPA_USINAS, servirEstatico } from '../src/modules/dashboard/ui/estatico.js';
import { JS_MAPA_USINAS, JS_MAPA_USINA } from '../src/modules/dashboard/ui/mapa-cliente.js';
import type { Request, Response } from 'express';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const junior: DashUser = { id: 'u', companyId: '00000000-0000-0000-0000-000000000001', nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const AGORA = new Date('2026-09-28T15:00:00Z');

describe('MapLibre do CDN', () => {
  it('versão FIXA no jsDelivr, com integridade (SRI) nos dois arquivos', () => {
    expect(MAPLIBRE.js).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl@\d+\.\d+\.\d+\/dist\/maplibre-gl\.js$/);
    expect(MAPLIBRE.css).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl@\d+\.\d+\.\d+\/dist\/maplibre-gl\.css$/);
    expect(MAPLIBRE.jsSri).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    expect(MAPLIBRE.cssSri).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
  });
});

describe('arquivos do mapa (cache longo, nome com hash)', () => {
  function servir(url: string) {
    const h: Record<string, string> = {};
    let corpo: unknown = null; let status = 200;
    const res = { setHeader: (k: string, v: string) => { h[k.toLowerCase()] = v; }, send: (b: unknown) => { corpo = b; }, status: (n: number) => { status = n; return res; }, type: () => res } as unknown as Response;
    servirEstatico({ params: { arquivo: url.split('/').pop() } } as unknown as Request, res);
    return { h, corpo: String(corpo), status };
  }
  it('JS do mapa sai como javascript, com hash e cache de 1 ano', () => {
    expect(URL_JS_MAPA_USINAS).toMatch(/^\/dashboard\/estatico\/mapa-usinas\.[0-9a-f]{10}\.js$/);
    const r = servir(URL_JS_MAPA_USINAS);
    expect(r.status).toBe(200);
    expect(r.h['content-type']).toMatch(/^text\/javascript/);
    expect(r.h['cache-control']).toContain('immutable');
    expect(r.corpo).toBe(JS_MAPA_USINAS);
    expect(servir(URL_JS_MAPA_USINA).corpo).toBe(JS_MAPA_USINA);
  });
  it('dado do banco entra no DOM só por textContent (sem innerHTML com dado)', () => {
    expect(JS_MAPA_USINAS).not.toContain('innerHTML');
    // mini-mapa: o único innerHTML é o desenho fixo do alfinete
    expect(JS_MAPA_USINA.match(/innerHTML/g)?.length).toBe(1);
  });
});

describe('bloco do mapa no Command Center', () => {
  it('busca os dados no endpoint próprio e carrega o script do mapa por arquivo', () => {
    const h = blocoMapaUsinas({ podeLocalizar: true });
    expect(h).toContain('id="cc-mapa-usinas"');
    expect(h).toContain('data-url="/dashboard/command-center/mapa.json"');
    expect(h).toContain(`src="${URL_JS_MAPA_USINAS}"`);
    expect(h).toContain(`href="${URL_CSS_MAPA_USINAS}"`);
    expect(h).toContain(`data-ml-js-sri="${MAPLIBRE.jsSri}"`);
    expect(h).toContain('tiles.openfreemap.org/styles/');
    expect(h).toContain('data-localizar="/dashboard/monitoramento/localizar"');
    expect(h).toContain('Tela cheia');
    expect(linhasComTailwind(h)).toEqual([]);
  });

  it('sem permissão de editar: não oferece "Localizar"', () => {
    expect(blocoMapaUsinas({ podeLocalizar: false })).not.toContain('data-localizar=');
  });

  it('entra no Command Center quando a empresa tem o módulo e o papel vê usinas', () => {
    const h = renderCommandCenterPage({ agora: AGORA, nomeUsuario: 'Junior', dados: null, contratados: TODAS_PERMISSOES }, junior);
    expect(h).toContain('id="cc-mapa-usinas"');
    expect(h).toContain('Mapa das usinas');
  });

  it('módulo de usinas não contratado: nada de mapa (fica o bloco trancado)', () => {
    const h = renderCommandCenterPage({ agora: AGORA, nomeUsuario: 'Jimena', dados: null, contratados: { ...NENHUM_MODULO, leads: true } }, { ...junior, companyId: 'outra' });
    expect(h).not.toContain('id="cc-mapa-usinas"');
    expect(h).not.toContain(URL_JS_MAPA_USINAS);
  });
});

describe('mini-mapa da tela da usina', () => {
  const s = { id: '11111111-2222-3333-4444-555555555555', apelido: 'Casa <b>Silva</b>', cidade: 'Gama', uf: 'DF', lat: -16.02, lng: -48.06, geo_fonte: 'endereco' };

  it('alfinete arrastável só pra quem pode editar; salva na rota da usina', () => {
    const h = blocoMiniMapaUsina(s, { podeEditar: true });
    expect(h).toContain('id="mu-mapa-usina"');
    expect(h).toContain('data-pode-editar="1"');
    expect(h).toContain(`data-url-salvar="/dashboard/monitoramento/${s.id}/posicao"`);
    expect(h).toContain(`data-url-localizar="/dashboard/monitoramento/localizar/${s.id}"`);
    expect(h).toContain('data-lat="-16.02"');
    expect(h).toContain(`src="${URL_JS_MAPA_USINA}"`);
    expect(h).toContain('Pelo endereço');
    expect(blocoMiniMapaUsina(s, { podeEditar: false })).toContain('data-pode-editar="0"');
  });

  it('sem posição: centraliza na cidade e avisa; manual aparece como "Ajustada à mão"', () => {
    const h = blocoMiniMapaUsina({ ...s, lat: null, lng: null, geo_fonte: null }, { podeEditar: true });
    expect(h).toContain('data-lat=""');
    expect(h).toContain('data-centro-lat="-16.019"');
    expect(h).toContain('Sem localização');
    expect(blocoMiniMapaUsina({ ...s, geo_fonte: 'manual' }, { podeEditar: true })).toContain('Ajustada à mão');
  });
});

describe('página "Localizar usinas sem posição"', () => {
  it('lista as pendentes (escapadas), tem o botão e não carrega Tailwind', () => {
    const h = renderLocalizarUsinasPage({
      pendentes: [{ id: 'a', apelido: 'Usina <script>x</script>', cidade: 'Gama', uf: 'DF' }],
      user: junior,
    });
    expect(h).toContain('Localizar usinas sem posição');
    expect(h).toContain('Usina &lt;script&gt;x&lt;/script&gt;');
    expect(h).not.toContain('<script>x</script>');
    expect(h).toContain('data-acao="localizar-todas"');
    expect(h).toContain('/dashboard/monitoramento/localizar/');
    expect(h).not.toContain('cdn.tailwindcss.com');
    expect(h).toContain('OpenStreetMap');
  });

  it('nada pendente: diz que está tudo no mapa', () => {
    const h = renderLocalizarUsinasPage({ pendentes: [], user: junior });
    expect(h).toContain('Todas as usinas ativas já estão no mapa');
    expect(h).not.toContain('data-acao="localizar-todas"');
  });
});

describe('tela da usina (detalhe) e rotas no router', () => {
  it('o mini-mapa entra no detalhe e o recarregamento automático respeita o alfinete sendo arrastado', async () => {
    const { renderDetalheSistemaPage } = await import('../src/modules/dashboard/views.js');
    const sistema = {
      id: '11111111-2222-3333-4444-555555555555', company_id: junior.companyId, lead_id: null, apelido: 'Casa Silva', marca_inversor: 'deye' as const,
      api_credentials: {}, potencia_kwp: 8, data_instalacao: null, cidade: 'Gama', uf: 'DF', ativo: true, ultima_sincronizacao: null, ultimo_erro: null,
      lat: -16.02, lng: -48.06, geo_fonte: 'endereco',
    };
    const d = {
      sistema, kpis: { hojeKwh: 10, mesKwh: 100, anoKwh: 1000, totalKwh: 2000, esperadoDiaKwh: 30, ratioUltimos7: 1, medianaCarteira7d: null },
      alertas: [], vista: 'mes' as const, ref: '2026-09-28', nav: { anterior: '2026-08-28', proximo: null, label: 'set/2026' },
      serie: [{ x: '2026-09-01', kwh: 30 }], totalDiaKwh: null, serieMensalCompleta: [],
    };
    const mapa = blocoMiniMapaUsina(sistema, { podeEditar: true });
    const h = renderDetalheSistemaPage(d as never, null, null, null, [], '', junior, mapa);
    expect(h).toContain('id="mu-mapa-usina"');
    expect(h).toContain('if (!window.ccSegurarRecarga) location.reload()');
    expect(h).not.toContain('setTimeout(() => location.reload(), 30000)');
  });

  it('as rotas do mapa ficam ANTES de /monitoramento/:id (senão "localizar" vira UUID inválido)', async () => {
    const { readFileSync } = await import('fs');
    const fonte = readFileSync('src/modules/dashboard/router.ts', 'utf-8');
    const idDetalhe = fonte.indexOf("router.get('/monitoramento/:id',");
    for (const r of ["router.get('/command-center/mapa.json'", "router.get('/monitoramento/localizar'", "router.post('/monitoramento/localizar/:id'", "router.post('/monitoramento/:id/posicao'"]) {
      const i = fonte.indexOf(r);
      expect(i, r).toBeGreaterThan(0);
      expect(i, r).toBeLessThan(idDetalhe);
    }
  });
});
