// 02/10/2026 — SolarEdge API V2 (V1 desliga em 01/11/2026).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { partirPorMes, _zerarThrottleV2, energiaCacheada } from '../src/modules/monitoring/adapters/solaredge-v2.js';
import { solarEdgeAdapter, chaveV2 } from '../src/modules/monitoring/adapters/solaredge.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

beforeEach(() => { _zerarThrottleV2(); vi.unstubAllEnvs(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('chave V2 — isolamento por empresa', () => {
  const env = { SOLAREDGE_FLEET_KEY: 'CASA-KEY' } as NodeJS.ProcessEnv;
  it('usina da casa usa a chave do ambiente', () => {
    expect(chaveV2({ site_id: '1' }, { companyId: CASA }, env)).toBe('CASA-KEY');
    expect(chaveV2({ site_id: '1' }, { companyId: null }, env)).toBe('CASA-KEY'); // legado sem empresa = casa
  });
  it('usina de empresa cliente NUNCA usa a chave da casa', () => {
    expect(chaveV2({ site_id: '1' }, { companyId: 'outra' }, env)).toBeNull();
    expect(chaveV2({ site_id: '1' }, undefined, env)).toBeNull(); // sem contexto = falha fechada
  });
  it('chave própria da empresa (fleet_key) vale sempre', () => {
    expect(chaveV2({ fleet_key: 'TENANT' }, { companyId: 'outra' }, env)).toBe('TENANT');
  });
});

describe('V2 — energia diária', () => {
  it('parte o período por mês (limite de 1 mês por chamada)', () => {
    expect(partirPorMes('2026-09-20', '2026-11-05')).toEqual([
      ['2026-09-20', '2026-09-30'], ['2026-10-01', '2026-10-31'], ['2026-11-01', '2026-11-05'],
    ]);
  });
  it('usina da casa com chave: busca na V2 (header X-API-Key, kWh) e não manda a chave na URL', async () => {
    vi.stubEnv('SOLAREDGE_FLEET_KEY', 'CASA-KEY');
    const f = vi.fn().mockResolvedValue(res(200, { unit: 'KWH', values: [{ timestamp: '2026-10-01T00:00:00', value: 52.4 }, { timestamp: '2026-10-02T00:00:00', value: null }] }));
    vi.stubGlobal('fetch', f);
    const r = await solarEdgeAdapter.fetchGeneration({ site_id: '4577375', api_key: 'V1' }, '2026-10-01', '2026-10-02', { companyId: CASA });
    expect(r).toEqual({ ok: true, geracoes: [{ data: '2026-10-01', geracao_kwh: 52.4 }] });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain('/v2/sites/4577375/energy');
    expect(String(url)).toContain('resolution=DAY');
    expect(String(url)).not.toContain('CASA-KEY');
    expect(init.headers['X-API-Key']).toBe('CASA-KEY');
  });
  it('usina de empresa cliente segue na V1 com a chave dela', async () => {
    vi.stubEnv('SOLAREDGE_FLEET_KEY', 'CASA-KEY');
    const f = vi.fn().mockResolvedValue(res(200, { energy: { unit: 'Wh', values: [{ date: '2026-10-01 00:00:00', value: 30000 }] } }));
    vi.stubGlobal('fetch', f);
    const r = await solarEdgeAdapter.fetchGeneration({ site_id: '9', api_key: 'TENANT-V1' }, '2026-10-01', '2026-10-01', { companyId: 'outra' });
    expect(r).toEqual({ ok: true, geracoes: [{ data: '2026-10-01', geracao_kwh: 30 }] });
    expect(String(f.mock.calls[0][0])).toContain('/site/9/energy');
    expect(String(f.mock.calls[0][0])).toContain('api_key=TENANT-V1');
  });
  it('429 com crédito por minuto zerado vs créditos do mês acabaram', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(429, {}, { 'x-ratelimit-remaining-minute': '5' })));
    const r = await solarEdgeAdapter.fetchGeneration({ site_id: '1' , fleet_key: 'K' }, '2026-10-01', '2026-10-01', { companyId: CASA });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/^SolarEdge V2 429: créditos do mês/);
  });
  it('cache: 2ª chamada na mesma janela de dia não gasta crédito', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { unit: 'KWH', values: [] }));
    vi.stubGlobal('fetch', f);
    const meioDia = new Date('2026-10-02T15:00:00Z');
    await energiaCacheada('K', '1', '2026-10-01', '2026-10-02', meioDia);
    await energiaCacheada('K', '1', '2026-10-01', '2026-10-02', new Date(meioDia.getTime() + 30 * 60_000));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('V2 — importar usinas (lista da conta)', () => {
  it('chave digitada que é V2: lista pela V2 e grava fleet_key em cada usina', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { sites: { count: 1, site: [{ siteId: 77, name: 'Villeneuve', peakPower: 109.9, location: { city: 'Brasília' } }] } })));
    const r = await solarEdgeAdapter.listSites!({ api_key: 'FLEET' });
    expect(r.ok && r.sites[0]).toMatchObject({ externalId: '77', apelido: 'Villeneuve', potencia_kwp: 109.9, credenciais: { site_id: '77', fleet_key: 'FLEET' } });
  });
  it('chave V1 (V2 recusa com 401) → cai na V1; a chave do ambiente nunca é usada', async () => {
    vi.stubEnv('SOLAREDGE_FLEET_KEY', 'CASA-KEY');
    const f = vi.fn()
      .mockResolvedValueOnce(res(401, {}))
      .mockResolvedValueOnce(res(200, { sites: { site: [{ id: 5, name: 'Casa X' }] } }));
    vi.stubGlobal('fetch', f);
    const r = await solarEdgeAdapter.listSites!({ api_key: 'V1KEY' });
    expect(r.ok && r.sites[0].credenciais).toEqual({ site_id: '5', api_key: 'V1KEY' });
    for (const [, init] of f.mock.calls) expect(JSON.stringify(init ?? {})).not.toContain('CASA-KEY');
  });
});
