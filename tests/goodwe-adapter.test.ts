// Adapter GoodWe — SEMS+ (29/09/2026). O SEMS antigo (www.semsportal.com/api/v2)
// foi desligado em 23/09 e as 10 usinas GoodWe ficaram sem dado. Estes testes
// travam a API nova observada no portal logado (us-semsplus.goodwe.com):
//   - login: pwd = Base64(MD5hex(senha)); `data` do login vai inteiro no header `token`
//   - geração do dia: POST {gw}/web/sems/sems-plant/api/stations/production (1 por dia)
//   - curva: statisticsAndPreV2 · lista: sems-dashboard-web/front/page/stationPage
// Respostas reais (anonimizadas) em tests/fixtures/goodwe-semsplus/.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseCreds,
  buildSiteCredenciais,
  codificarSenha,
  assinaturaSemsPlus,
  basesDaApi,
  parseLocation,
  kwhDoDia,
  diasParaBuscar,
  parseCurvaSemsPlus,
  parseStationRecord,
  mapStatusGoodweStation,
  goodweAdapter,
  limparCachesGoodwe,
  type ParsedCreds,
} from '../src/modules/monitoring/adapters/goodwe.js';
import { clearAllTokens } from '../src/modules/monitoring/util/token-cache.js';

const FIX = join(__dirname, 'fixtures', 'goodwe-semsplus');
const fixture = (nome: string): any => JSON.parse(readFileSync(join(FIX, nome), 'utf8'));

function resJson(status: number, jsonBody: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  } as Response;
}

const LOGIN_DATA = {
  uid: 'uid-1', timestamp: 1790000000000, token: 'tok-1', client: 'semsPlusWeb', version: '',
  language: 'en', api: 'https://us-gateway.semsportal.com/web/sems', region: 'us', uuid: 'uu-1',
};
const loginOk = (data: Record<string, unknown> = LOGIN_DATA) => resJson(200, { code: '00000', description: 'ok', data });
const prod = (kwh: unknown) => resJson(200, { code: '00000', data: { proSystemTotalStats: kwh, profitProStats: 0, currency: 'USD' } });

const SENHA = 'senha-teste-123';
const CREDS = { email: 'instalador@teste.com', password: SENHA, site_id: '00000000-0000-4000-8000-000000000001' };

beforeEach(() => { clearAllTokens(); limparCachesGoodwe(); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearAllTokens();
  limparCachesGoodwe();
});

// ============================================================================
// Credenciais (formato do banco não muda)
// ============================================================================

describe('parseCreds', () => {
  it('aceita { email, password } + site_id', () => {
    const c = parseCreds({ email: 'a@b.com', password: 'x', site_id: 'UUID-1' }) as ParsedCreds;
    expect(c).toEqual({ email: 'a@b.com', password: 'x', siteId: 'UUID-1' });
  });
  it('aceita aliases account/pwd e powerstation_id', () => {
    const c = parseCreds({ account: ' a@b.com ', pwd: ' x ', powerstation_id: 'PS-9' }) as ParsedCreds;
    expect(c).toEqual({ email: 'a@b.com', password: 'x', siteId: 'PS-9' });
  });
  it('sem site_id fica undefined (conta)', () => {
    expect((parseCreds({ email: 'a@b.com', password: 'x' }) as ParsedCreds).siteId).toBeUndefined();
  });
  it('erro sem email/senha', () => {
    const r = parseCreds({ foo: 'bar' });
    expect((r as { error: string }).error).toMatch(/email/i);
  });
});

describe('buildSiteCredenciais', () => {
  it('grava chave site_id + carrega email/senha', () => {
    expect(buildSiteCredenciais({ email: 'a@b.com', password: 'x' }, 'PS-1')).toEqual({ email: 'a@b.com', password: 'x', site_id: 'PS-1' });
  });
});

// ============================================================================
// Login: senha codificada + assinatura + bases
// ============================================================================

describe('codificarSenha', () => {
  it('Base64 do MD5 hex minúsculo (44 caracteres)', () => {
    // md5("senha-teste-123") = 9fc229a68a6b910f8742968f0b4c955f
    expect(codificarSenha(SENHA)).toBe('OWZjMjI5YTY4YTZiOTEwZjg3NDI5NjhmMGI0Yzk1NWY=');
    expect(codificarSenha(SENHA)).toHaveLength(44);
  });
});

describe('assinaturaSemsPlus', () => {
  it('Base64( sha256hex(ts@uid@token) + "@" + ts )', () => {
    const sig = assinaturaSemsPlus(1790000000000, 'uid-1', 'tok-1');
    const dec = Buffer.from(sig, 'base64').toString('utf8');
    const [hash, ts] = dec.split('@');
    expect(ts).toBe('1790000000000');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // determinístico
    expect(assinaturaSemsPlus(1790000000000, 'uid-1', 'tok-1')).toBe(sig);
  });
});

describe('basesDaApi', () => {
  it('deriva as bases de planta e de dashboard a partir de data.api', () => {
    expect(basesDaApi('https://eu-gateway.semsportal.com/web/sems')).toEqual({
      plant: 'https://eu-gateway.semsportal.com/web/sems/sems-plant/api',
      dashboard: 'https://eu-gateway.semsportal.com/sems/sems-dashboard-web/api',
    });
  });
  it('sem api (ou host estranho) → gateway US', () => {
    const us = {
      plant: 'https://us-gateway.semsportal.com/web/sems/sems-plant/api',
      dashboard: 'https://us-gateway.semsportal.com/sems/sems-dashboard-web/api',
    };
    expect(basesDaApi(undefined)).toEqual(us);
    expect(basesDaApi('lixo')).toEqual(us);
    expect(basesDaApi('https://evil.example.com/web/sems')).toEqual(us);
    expect(basesDaApi('http://us-gateway.semsportal.com/web/sems')).toEqual(us);
  });
});

// ============================================================================
// Parsing puro
// ============================================================================

describe('parseLocation', () => {
  it('extrai cidade e UF', () => {
    expect(parseLocation('Quadra 1 Conjunto D, 51 - Planaltina, Brasília - DF, Brasil')).toEqual({ cidade: 'Brasília', uf: 'DF' });
    expect(parseLocation('Rua X, 10, Centro, Anápolis - GO')).toEqual({ cidade: 'Anápolis', uf: 'GO' });
  });
  it('sem padrão → nulls', () => {
    expect(parseLocation('sem uf')).toEqual({ cidade: null, uf: null });
    expect(parseLocation(null)).toEqual({ cidade: null, uf: null });
  });
});

describe('kwhDoDia (stations/production)', () => {
  it('lê proSystemTotalStats da resposta real', () => {
    expect(kwhDoDia(fixture('production-day.json').data)).toBe(20.8);
  });
  it('0, null, ausente ou lixo = sem leitura (null), nunca 0 kWh', () => {
    expect(kwhDoDia({ proSystemTotalStats: 0 })).toBeNull();
    expect(kwhDoDia({ proSystemTotalStats: null })).toBeNull();
    expect(kwhDoDia({})).toBeNull();
    expect(kwhDoDia(undefined)).toBeNull();
    expect(kwhDoDia({ proSystemTotalStats: 'abc' })).toBeNull();
    expect(kwhDoDia({ proSystemTotalStats: -2 })).toBeNull();
  });
  it('aceita número em string e arredonda a 3 casas', () => {
    expect(kwhDoDia({ proSystemTotalStats: '12.34567' })).toBe(12.346);
  });
});

describe('diasParaBuscar', () => {
  it('lista os dias do intervalo, inclusive', () => {
    expect(diasParaBuscar('2026-09-27', '2026-09-29', '2026-09-29')).toEqual(['2026-09-27', '2026-09-28', '2026-09-29']);
  });
  it('corta no hoje de Brasília (nunca pede amanhã)', () => {
    expect(diasParaBuscar('2026-09-28', '2026-10-02', '2026-09-29')).toEqual(['2026-09-28', '2026-09-29']);
  });
  it('intervalo todo no futuro → vazio', () => {
    expect(diasParaBuscar('2026-10-01', '2026-10-02', '2026-09-29')).toEqual([]);
  });
});

describe('parseCurvaSemsPlus (statisticsAndPreV2)', () => {
  it('pega a série pSystem (kW), ignora null e sell/buy', () => {
    const pts = parseCurvaSemsPlus(fixture('curve-day.json').data);
    expect(pts.length).toBe(512);
    expect(pts[0]).toEqual({ hora: '05:53', kw: 0 });
    expect(pts.find((p) => p.hora === '08:30')).toEqual({ hora: '08:30', kw: 0.324 });
    expect(pts[pts.length - 1]).toEqual({ hora: '14:24', kw: 2.298 });
  });
  it('sem pSystem → vazio', () => {
    expect(parseCurvaSemsPlus({ dataList: [{ item: 'sell', powerData: [{ tp: '2026-09-29 10:00:00', power: 1 }] }] })).toEqual([]);
    expect(parseCurvaSemsPlus(undefined)).toEqual([]);
  });
});

describe('mapStatusGoodweStation (enum do SEMS+: 0 offline · 1 running · 2 fault · 3 waiting · 11 constructing)', () => {
  it('1 (gerando) e 3 (em espera) → ok', () => {
    expect(mapStatusGoodweStation(1)).toBe('ok');
    expect(mapStatusGoodweStation(3)).toBe('ok');
  });
  it('0 → offline', () => expect(mapStatusGoodweStation(0)).toBe('offline'));
  it('2 → falha', () => expect(mapStatusGoodweStation(2)).toBe('falha'));
  it('11 (em construção) / estranho / ausente → desconhecido', () => {
    expect(mapStatusGoodweStation(11)).toBe('desconhecido');
    expect(mapStatusGoodweStation(77)).toBe('desconhecido');
    expect(mapStatusGoodweStation(undefined)).toBe('desconhecido');
  });
});

describe('parseStationRecord (stationPage)', () => {
  it('mapeia o registro real (sem potência na lista — não inventa kWp)', () => {
    const rec = fixture('station-page.json').data.dataList[1];
    expect(parseStationRecord(rec)).toEqual({
      externalId: '00000000-0000-4000-8000-000000000002',
      apelido: 'Usina Teste 2',
      potencia_kwp: null,
      cidade: 'Brasília',
      uf: 'DF',
      data_instalacao: null,
      lat: -15.61,
      lng: -47.65,
    });
  });
  it('installedCapacity em W vira kWp quando vier', () => {
    expect(parseStationRecord({ id: 'X', name: 'S', installedCapacity: 10500 })?.potencia_kwp).toBe(10.5);
  });
  it('sem id → null', () => expect(parseStationRecord({ name: 'sem id' })).toBeNull());
});

// ============================================================================
// Adapter (fetch mockado)
// ============================================================================

describe('goodweAdapter — login', () => {
  it('manda pwd codificado, token inicial semsPlusWeb e depois o data inteiro no header token', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      calls.push({ url: String(url), init });
      const u = String(url);
      if (u.includes('/auth/cross-login')) return loginOk();
      if (u.includes('/front/page/stationPage')) return resJson(200, fixture('station-page.json'));
      return resJson(200, fixture('production-day.json'));
    }));

    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-20', '2026-09-20');
    expect(r.ok).toBe(true);

    const login = calls[0];
    expect(login.url).toBe('https://us-semsplus.goodwe.com/web/sems/sems-user/api/v1/auth/cross-login');
    expect(login.init.method).toBe('POST');
    const body = JSON.parse(login.init.body);
    expect(body).toEqual({ account: CREDS.email, pwd: 'OWZjMjI5YTY4YTZiOTEwZjg3NDI5NjhmMGI0Yzk1NWY=', agreement: 1, isLocal: false, isChinese: false });
    expect(JSON.parse(login.init.headers.token)).toMatchObject({ client: 'semsPlusWeb', token: '', uid: '' });
    // senha nunca vai crua
    expect(login.init.body).not.toContain(SENHA);

    const producao = calls.find((c) => c.url.includes('/stations/production'))!;
    expect(producao.url).toBe('https://us-gateway.semsportal.com/web/sems/sems-plant/api/stations/production');
    expect(JSON.parse(producao.init.headers.token)).toEqual(LOGIN_DATA);
    expect(producao.init.headers['x-signature']).toBeTruthy();
    expect(producao.init.headers.currentlang).toBe('en');
    expect(JSON.parse(producao.init.body)).toEqual({
      stationId: CREDS.site_id,
      items: ['profitProStats', 'proSystemTotalStats'],
      dimension: 'day',
      isReport: false,
      startTime: '2026-09-20 00:00:00',
      endTime: '2026-09-20 23:59:59',
    });
  });

  it('usa o gateway que o login devolver (data.api)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes('/auth/cross-login')) return loginOk({ ...LOGIN_DATA, api: 'https://eu-gateway.semsportal.com/web/sems' });
      if (String(url).includes('stationPage')) return resJson(200, fixture('station-page.json'));
      return prod(5);
    }));
    await goodweAdapter.fetchGeneration(CREDS, '2026-09-20', '2026-09-20');
    expect(urls.some((u) => u.startsWith('https://eu-gateway.semsportal.com/web/sems/sems-plant/api/stations/production'))).toBe(true);
  });

  it('login recusado por senha (código A02xx) → invalidCredentials, sem repetir', async () => {
    const fetchMock = vi.fn(async () => resJson(200, { code: 'A0210', description: 'password error' }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-20', '2026-09-20');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
    expect(r.reason).not.toContain(SENHA);
  });

  it('login com erro de sistema (código B) NÃO desativa a usina', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resJson(200, { code: 'B0001', description: 'system error' })));
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-20', '2026-09-20');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBeFalsy();
  });

  it('token fica em cache: 2 sincronizações = 1 login', async () => {
    let logins = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/auth/cross-login')) { logins++; return loginOk(); }
      if (String(url).includes('stationPage')) return resJson(200, fixture('station-page.json'));
      return prod(3);
    }));
    await goodweAdapter.fetchGeneration(CREDS, '2026-09-18', '2026-09-20');
    await goodweAdapter.fetchGeneration({ ...CREDS, site_id: '00000000-0000-4000-8000-000000000002' }, '2026-09-18', '2026-09-20');
    expect(logins).toBe(1);
  });
});

describe('goodweAdapter.fetchGeneration', () => {
  it('1 chamada por dia; dias sem leitura ficam de fora (nunca 0); status real da lista', async () => {
    const pedidos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) return loginOk();
      if (u.includes('stationPage')) return resJson(200, fixture('station-page.json'));
      const body = JSON.parse(init.body);
      pedidos.push(body.startTime.slice(0, 10));
      if (body.startTime.startsWith('2026-09-19')) return prod(0); // sem leitura
      if (body.startTime.startsWith('2026-09-20')) return prod(null);
      return resJson(200, fixture('production-day.json'));   // 20.8
    }));
    const r = await goodweAdapter.fetchGeneration(
      { ...CREDS, site_id: '00000000-0000-4000-8000-000000000004' }, // status 2 = falha
      '2026-09-18', '2026-09-21',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(pedidos.sort()).toEqual(['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21']);
    expect(r.geracoes).toEqual([
      { data: '2026-09-18', geracao_kwh: 20.8 },
      { data: '2026-09-21', geracao_kwh: 20.8 },
    ]);
    expect(r.falhaParcial).toBeUndefined();
    expect(r.statusInversor).toBe('falha');
  });

  it('dia que falha NÃO vem em geracoes e vira falhaParcial', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) return loginOk();
      if (u.includes('stationPage')) return resJson(200, fixture('station-page.json'));
      const body = JSON.parse(init.body);
      if (body.startTime.startsWith('2026-09-19')) return resJson(200, { code: 'B0001', description: 'erro' });
      return prod(10);
    }));
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-18', '2026-09-20');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes.map((g) => g.data)).toEqual(['2026-09-18', '2026-09-20']);
    expect(r.falhaParcial).toBe('1 de 3 dias não respondeu (19/09)');
    expect(r.statusInversor).toBe('ok');
  });

  it('todos os dias falharam → erro (cron tenta de novo), sem desativar', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/auth/cross-login')) return loginOk();
      return resJson(200, { code: 'B0001', description: 'erro do servidor' });
    }));
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-18', '2026-09-19');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBeFalsy();
    expect(r.reason).toMatch(/B0001/);
  });

  it('nunca pede dia depois do hoje de Brasília', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T01:30:00Z')); // 29/09 22:30 em Brasília
    const pedidos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      if (String(url).includes('/auth/cross-login')) return loginOk();
      if (String(url).includes('stationPage')) return resJson(200, fixture('station-page.json'));
      pedidos.push(JSON.parse(init.body).startTime);
      return prod(1);
    }));
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-28', '2026-09-30');
    expect(r.ok).toBe(true);
    expect(pedidos.sort()).toEqual(['2026-09-28 00:00:00', '2026-09-29 00:00:00']);
  });

  it('sessão expirada (C0602) → reloga 1× e repete; token velho não fica', async () => {
    let logins = 0;
    const tokensUsados: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) { logins++; return loginOk({ ...LOGIN_DATA, token: `tok-${logins}` }); }
      if (u.includes('stationPage')) return resJson(200, fixture('station-page.json'));
      const tk = JSON.parse(init.headers.token).token;
      tokensUsados.push(tk);
      if (tk === 'tok-1') return resJson(200, { code: 'C0602', description: 'token expired' });
      return prod(7);
    }));
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-20', '2026-09-20');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(logins).toBe(2);
    expect(r.geracoes).toEqual([{ data: '2026-09-20', geracao_kwh: 7 }]);
    expect(tokensUsados).toEqual(['tok-1', 'tok-2']);
  });

  it('vários dias expiram juntos → um único relogin (não martela o login)', async () => {
    let logins = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) { logins++; return loginOk({ ...LOGIN_DATA, token: `tok-${logins}` }); }
      if (u.includes('stationPage')) return resJson(200, fixture('station-page.json'));
      if (JSON.parse(init.headers.token).token === 'tok-1') return resJson(200, { code: 100002, description: 'invalid token' });
      return prod(2);
    }));
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-14', '2026-09-20');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toHaveLength(7);
    expect(logins).toBe(2);
  });

  it('continua expirando depois do relogin → falha do dia (sem loop)', async () => {
    let logins = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) { logins++; return loginOk(); }
      return resJson(200, { code: 'A0301', description: 'unauthorized' });
    }));
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-20', '2026-09-20');
    expect(r.ok).toBe(false);
    expect(logins).toBe(2);
  });

  it('limita chamadas simultâneas (no máximo 4 dias em paralelo)', async () => {
    let emVoo = 0;
    let pico = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) return loginOk();
      if (u.includes('stationPage')) return resJson(200, fixture('station-page.json'));
      emVoo++; pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
      return prod(1);
    }));
    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-09-01', '2026-09-20');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toHaveLength(20);
    expect(pico).toBeLessThanOrEqual(4);
    expect(pico).toBeGreaterThan(1);
  });

  it('status da lista fica em cache (10 usinas não viram 10 listas)', async () => {
    let listas = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) return loginOk();
      if (u.includes('stationPage')) { listas++; return resJson(200, fixture('station-page.json')); }
      return prod(1);
    }));
    for (let i = 1; i <= 5; i++) {
      await goodweAdapter.fetchGeneration({ ...CREDS, site_id: `00000000-0000-4000-8000-00000000000${i}` }, '2026-09-20', '2026-09-20');
    }
    // residencial + comercial = até 2 chamadas por conta, não 10
    expect(listas).toBeLessThanOrEqual(2);
  });

  it('status indisponível não derruba a geração', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) return loginOk();
      if (u.includes('stationPage')) return resJson(500, {});
      return prod(4);
    }));
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const p = goodweAdapter.fetchGeneration(CREDS, '2026-09-20', '2026-09-20');
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-09-20', geracao_kwh: 4 }]);
    expect(r.statusInversor).toBe('desconhecido');
  });

  it('sem site_id → invalidCredentials; sem credencial → erro', async () => {
    const r1 = await goodweAdapter.fetchGeneration({ email: 'a@b.com', password: 'x' }, '2026-09-20', '2026-09-20');
    expect(r1.ok).toBe(false);
    expect((r1 as { invalidCredentials?: boolean }).invalidCredentials).toBe(true);
    const r2 = await goodweAdapter.fetchGeneration({}, '2026-09-20', '2026-09-20');
    expect(r2.ok).toBe(false);
  });
});

describe('goodweAdapter.fetchIntraday', () => {
  it('chama statisticsAndPreV2 com o dia em hora local e devolve a curva em kW', async () => {
    let corpo: any = null;
    let url = '';
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: any) => {
      if (String(u).includes('/auth/cross-login')) return loginOk();
      url = String(u);
      corpo = JSON.parse(init.body);
      return resJson(200, fixture('curve-day.json'));
    }));
    const r = await goodweAdapter.fetchIntraday!(CREDS, '2026-09-29');
    expect(url).toBe('https://us-gateway.semsportal.com/web/sems/sems-plant/api/v1/hems/power/statisticsAndPreV2');
    expect(corpo).toMatchObject({
      stationId: CREDS.site_id, items: ['pSystem'], timeZone: 3,
      startTime: '2026-09-29 00:00:00', endTime: '2026-09-29 23:59:59',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pontos.length).toBe(512);
    expect(r.pontos[0]).toEqual({ hora: '05:53', kw: 0 });
  });
});

describe('goodweAdapter.listSites (descoberta)', () => {
  it('lista residencial + comercial pelo stationPage, sem duplicar, com credencial por usina', async () => {
    const corpos: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: any) => {
      const url = String(u);
      if (url.includes('/auth/cross-login')) return loginOk();
      expect(url).toBe('https://us-gateway.semsportal.com/sems/sems-dashboard-web/api/front/page/stationPage');
      const body = JSON.parse(init.body);
      corpos.push(body);
      if (body.stationTypeEnum === 'HOUSEHOLD_PHOTOVOLTAIC') return resJson(200, fixture('station-page.json'));
      // comercial: 1 usina nova + 1 repetida
      return resJson(200, { code: '00000', data: { dataList: [
        { id: 'ci-1', name: 'Comércio Teste', status: 1, stationAddress: 'Rua Z, 1 - Taguatinga, Brasília - DF, Brasil' },
        fixture('station-page.json').data.dataList[0],
      ], total: 2 } });
    }));
    const r = await goodweAdapter.listSites!({ email: CREDS.email, password: SENHA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sites).toHaveLength(9);
    expect(r.sites[0].credenciais).toEqual({ email: CREDS.email, password: SENHA, site_id: '00000000-0000-4000-8000-000000000001' });
    expect(r.sites.find((s) => s.externalId === 'ci-1')?.apelido).toBe('Comércio Teste');
    expect(corpos[0]).toMatchObject({ size: 1000, current: 1, stationTypeEnum: 'HOUSEHOLD_PHOTOVOLTAIC' });
    expect(corpos.map((c) => c.stationTypeEnum).sort()).toEqual(['HOUSEHOLD_PHOTOVOLTAIC', 'INDUSTRIAL_AND_COMMERCIAL']);
    // nenhuma usina vem com kWp inventado (a lista não traz potência)
    expect(r.sites.every((s) => s.potencia_kwp === null)).toBe(true);
  });

  it('lista comercial falhou mas a residencial veio → devolve o que tem', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: any) => {
      if (String(u).includes('/auth/cross-login')) return loginOk();
      const body = JSON.parse(init.body);
      if (body.stationTypeEnum === 'HOUSEHOLD_PHOTOVOLTAIC') return resJson(200, fixture('station-page.json'));
      return resJson(200, { code: 'B0001', description: 'erro' });
    }));
    const r = await goodweAdapter.listSites!({ email: CREDS.email, password: SENHA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sites).toHaveLength(8);
  });

  it('login com senha errada → invalidCredentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resJson(200, { code: 'A0210', description: 'password error' })));
    const r = await goodweAdapter.listSites!({ email: CREDS.email, password: 'errada' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });

  it('extractAccountCreds tira o site_id, deixa email+senha', () => {
    expect(goodweAdapter.extractAccountCreds!({ email: 'a@b.com', password: 'x', site_id: 'PS-1' })).toEqual({ email: 'a@b.com', password: 'x' });
    expect(goodweAdapter.extractAccountCreds!({ foo: 1 })).toBeNull();
  });

  it('marca é goodwe', () => expect(goodweAdapter.marca).toBe('goodwe'));
});
