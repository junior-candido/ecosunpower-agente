// 02/10/2026 — Conector Hoymiles (S-Miles Cloud, login do instalador).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hoymilesAdapter, senhaSemSal, _zerarHoymiles } from '../src/modules/monitoring/adapters/hoymiles.js';

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (data: unknown) => res({ status: '0', message: 'success', data });
let n = 0;
const credsNovas = () => ({ email: `teste${++n}@x.com`, password: 'senha' }); // conta nova = sem token em cache

beforeEach(() => { _zerarHoymiles(); vi.useFakeTimers({ toFake: ['setTimeout'] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function rodar<T>(p: Promise<T>): Promise<T> { await vi.runAllTimersAsync(); return p; }

describe('Hoymiles', () => {
  it('senha sem sal no formato do app: md5 hex + "." + base64(sha256)', () => {
    expect(senhaSemSal('abc')).toBe('900150983cd24fb0d6963f7d28e17f72.ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  });
  it('geração: um dia por chamada, kWh do total_pv_eq, token no header sem "Bearer"', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok({ n: 'N1', a: '' }))          // pre-insp
      .mockResolvedValueOnce(ok({ token: 'TOK' }))            // login
      .mockResolvedValueOnce(ok({ total_pv_eq: '21.19' }))
      .mockResolvedValueOnce(ok({ total_pv_eq: '19.71' }));
    vi.stubGlobal('fetch', f);
    const r = await rodar(hoymilesAdapter.fetchGeneration({ ...credsNovas(), site_id: '9966510' }, '2026-09-25', '2026-09-26'));
    expect(r).toEqual({ ok: true, geracoes: [{ data: '2026-09-25', geracao_kwh: 21.19 }, { data: '2026-09-26', geracao_kwh: 19.71 }] });
    const [, init] = f.mock.calls[2];
    expect(init.headers.Authorization).toBe('TOK');
    expect(JSON.parse(init.body)).toEqual({ sid_list: [9966510], mode: 1, start_date: '2026-09-25', end_date: '2026-09-25' });
  });
  it('conta com sal (Argon2) → erro claro, sem tentar login errado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ n: 'N', a: 'SAL' })));
    const r = await rodar(hoymilesAdapter.fetchGeneration({ ...credsNovas(), site_id: '1' }, '2026-09-25', '2026-09-25'));
    expect(!r.ok && r.reason).toContain('Argon2');
  });
  it('senha errada → credencial inválida', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(ok({ n: 'N', a: '' }))
      .mockResolvedValueOnce(res({ status: '2', message: 'password error' })));
    const r = await rodar(hoymilesAdapter.fetchGeneration({ ...credsNovas(), site_id: '1' }, '2026-09-25', '2026-09-25'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.invalidCredentials).toBe(true);
  });
  it('sem site_id ou sem senha → erro de credencial', async () => {
    const a = await hoymilesAdapter.fetchGeneration({ email: 'a@b' }, '2026-09-25', '2026-09-25');
    const b = await hoymilesAdapter.fetchGeneration({ email: 'a@b', password: 'x' }, '2026-09-25', '2026-09-25');
    expect(a.ok || b.ok).toBe(false);
  });
  it('listSites: grava email+senha+site_id em cada usina e pega posição do detalhe', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(ok({ n: 'N', a: '' }))
      .mockResolvedValueOnce(ok({ token: 'T' }))
      .mockResolvedValueOnce(ok({ list: [{ id: 7312, name: 'MarianaDias', capacitor: '8.00', address: 'Jardim Botânico, Brasília - DF, Brasil', create_at: '2024-03-01 10:00:00' }] }))
      .mockResolvedValueOnce(ok({ latitude: '-15.843', longitude: '-47.789' })));
    const c = credsNovas();
    const r = await rodar(hoymilesAdapter.listSites!(c));
    expect(r.ok && r.sites[0]).toMatchObject({ externalId: '7312', apelido: 'MarianaDias', potencia_kwp: 8, cidade: 'Brasília', data_instalacao: '2024-03-01', lat: -15.843, lng: -47.789, credenciais: { ...c, site_id: '7312' } });
  });
});
