// 02/10/2026 — Conector Growatt (OpenAPI V1 com token).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { growattAdapter, blocosDe7, _zerarGrowatt } from '../src/modules/monitoring/adapters/growatt.js';

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (data: unknown) => res({ error_code: 0, error_msg: '', data });
const C = { token: 'TOKEN32', site_id: '123' };

beforeEach(() => { _zerarGrowatt(); vi.useFakeTimers({ toFake: ['setTimeout'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function rodar<T>(p: Promise<T>): Promise<T> { await vi.runAllTimersAsync(); return p; }

describe('Growatt', () => {
  it('período partido em blocos de 7 dias (limite da API)', () => {
    expect(blocosDe7('2026-09-01', '2026-09-16')).toEqual([['2026-09-01', '2026-09-07'], ['2026-09-08', '2026-09-14'], ['2026-09-15', '2026-09-16']]);
  });
  it('geração diária: header token, servidor oficial padrão, kWh por dia', async () => {
    const f = vi.fn().mockResolvedValue(ok({ count: 2, energys: [{ date: '2026-09-25', energy: '21.4' }, { date: '2026-09-26', energy: 19.8 }] }));
    vi.stubGlobal('fetch', f);
    const r = await rodar(growattAdapter.fetchGeneration(C, '2026-09-25', '2026-09-26'));
    expect(r).toEqual({ ok: true, geracoes: [{ data: '2026-09-25', geracao_kwh: 21.4 }, { data: '2026-09-26', geracao_kwh: 19.8 }] });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain('https://openapi.growatt.com/v1/plant/energy');
    expect(String(url)).toContain('time_unit=day');
    expect(String(url)).not.toContain('TOKEN32');
    expect(init.headers.token).toBe('TOKEN32');
  });
  it('servidor fora da lista oficial é ignorado (não manda o token pra qualquer host)', async () => {
    const f = vi.fn().mockResolvedValue(ok({ energys: [] }));
    vi.stubGlobal('fetch', f);
    await rodar(growattAdapter.fetchGeneration({ ...C, base: 'https://evil.example.com' }, '2026-09-25', '2026-09-25'));
    expect(String(f.mock.calls[0][0])).toMatch(/^https:\/\/openapi\.growatt\.com\//);
  });
  it('token inválido → credencial; limite → 429 (sem repetir)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({ error_code: 10011, error_msg: 'error_permission_denied token' })));
    const a = await rodar(growattAdapter.fetchGeneration(C, '2026-09-25', '2026-09-25'));
    expect(!a.ok && a.invalidCredentials).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({ error_code: 10012, error_msg: 'error_frequently_access' })));
    const b = await rodar(growattAdapter.fetchGeneration(C, '2026-09-25', '2026-09-25'));
    expect(!b.ok && (b as { status?: number }).status).toBe(429);
  });
  it('lista de usinas com posição e credenciais por usina', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ count: 1, plants: [{ plant_id: 777, name: 'Renato', peak_power: 6.6, city: 'Brasília', latitude: '-15.8', longitude: '-47.9', create_date: '2026-09-30' }] })));
    const r = await rodar(growattAdapter.listSites!({ token: 'T' }));
    expect(r.ok && r.sites[0]).toMatchObject({ externalId: '777', apelido: 'Renato', potencia_kwp: 6.6, lat: -15.8, lng: -47.9, credenciais: { token: 'T', site_id: '777' } });
  });
  it('curva do dia: W → kW, hora HH:MM', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ powers: [{ time: '2026-10-01 10:05', power: 3200 }, { time: '2026-10-01 10:10', power: null }] })));
    const r = await rodar(growattAdapter.fetchIntraday!(C, '2026-10-01'));
    expect(r.ok && r.pontos[0]).toEqual({ hora: '10:05', kw: 3.2 });
  });
});
