import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  tokenSolfacilCacheado, _limparCacheToken, credsLojasDoEnv, puxarKitReal,
} from '../src/modules/vendas/lojas/kit-ao-vivo.js';

// resposta fake do getCustomKitOffersV2
const offersFake = {
  data: { getCustomKitOffersV2: { alert: null, offers: [
    { inverter_manufacturer: 'SOFAR', module_manufacturer: 'LEAPTON', total_value: 'R$ 6.908,00', value_per_wp: 'R$ 1,15/Wp', items: [], request: { region: 'DF' }, payment_conditions: [] },
  ] } },
};
// resposta fake do token Keycloak
const tokenResp = { ok: true, json: async () => ({ access_token: 'TOK123' }) };

beforeEach(() => _limparCacheToken());

describe('credsLojasDoEnv', () => {
  it('só inclui Sol Fácil se USER+PASS existem', () => {
    expect(credsLojasDoEnv({} as any).solfacil).toBeUndefined();
    expect(credsLojasDoEnv({ SOLFACIL_USER: 'u', SOLFACIL_PASS: 'p' } as any).solfacil).toEqual({ usuario: 'u', senha: 'p' });
  });
});

describe('tokenSolfacilCacheado', () => {
  it('faz login 1× e reusa dentro do TTL', async () => {
    const fetchFn = vi.fn(async () => tokenResp) as any;
    let t = 1_000_000;
    const agora = () => t;
    const a = await tokenSolfacilCacheado({ usuario: 'u', senha: 'p' }, agora, fetchFn);
    const b = await tokenSolfacilCacheado({ usuario: 'u', senha: 'p' }, agora, fetchFn);
    expect(a).toBe('TOK123'); expect(b).toBe('TOK123');
    expect(fetchFn).toHaveBeenCalledTimes(1); // reusou o cache
  });
  it('reloga depois do TTL', async () => {
    const fetchFn = vi.fn(async () => tokenResp) as any;
    let t = 0;
    const agora = () => t;
    await tokenSolfacilCacheado({ usuario: 'u', senha: 'p' }, agora, fetchFn);
    t = 5 * 60 * 1000; // passou do TTL (4 min)
    await tokenSolfacilCacheado({ usuario: 'u', senha: 'p' }, agora, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('puxarKitReal', () => {
  it('sem credencial → semCredencial true, sem chamar rede', async () => {
    const fetchFn = vi.fn() as any;
    const r = await puxarKitReal({ power: 5 }, {}, { fetchFn });
    expect(r.semCredencial).toBe(true);
    expect(r.solfacil).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('com Sol Fácil: token + kit real', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (/openid-connect\/token/.test(url)) return tokenResp as any;
      return { ok: true, json: async () => offersFake } as any;
    }) as any;
    const r = await puxarKitReal({ power: 5 }, { solfacil: { usuario: 'u', senha: 'p' } }, { agoraMs: () => 1, fetchFn });
    expect(r.semCredencial).toBe(false);
    expect(r.solfacil).toHaveLength(1);
    expect(r.solfacil[0].precoTotal).toBe(6908);
    expect(r.erros).toEqual([]);
  });

  it('erro na loja não derruba (fica no erros[])', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (/openid-connect\/token/.test(url)) return tokenResp as any;
      return { ok: false, status: 500, json: async () => ({}) } as any;
    }) as any;
    const r = await puxarKitReal({ power: 5 }, { solfacil: { usuario: 'u', senha: 'p' } }, { agoraMs: () => 1, fetchFn });
    expect(r.solfacil).toEqual([]);
    expect(r.erros[0]).toContain('Sol Fácil');
  });
});
