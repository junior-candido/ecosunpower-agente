// Testa o adapter Solis (API oficial SolisCloud, granularidade = USINA). Cobre
// parsing das credenciais, normalização da base URL, a ASSINATURA HMAC-SHA1, os
// meses do intervalo, o parse da energia diária (stationMonth), a capacidade por
// unidade, e o parse do registro de usina. A rede fica de fora (validada ao vivo).

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  parseCreds,
  buildSiteCredenciais,
  normalizeBase,
  solisSign,
  mesesNoIntervalo,
  parseStationMonth,
  capacidadeKwp,
  parseStationRecord,
  solisAdapter,
  type ParsedCreds,
} from '../src/modules/monitoring/adapters/solis.js';

// ============================================================================
// parseCreds / normalizeBase
// ============================================================================

describe('parseCreds', () => {
  it('aceita { keyId, keySecret } + apiUrl + site_id', () => {
    const c = parseCreds({ keyId: 'K1', keySecret: 'S1', apiUrl: 'https://x:13333/', site_id: 'ST-1' }) as ParsedCreds;
    expect(c.keyId).toBe('K1');
    expect(c.keySecret).toBe('S1');
    expect(c.base).toBe('https://x:13333');   // barra final removida
    expect(c.siteId).toBe('ST-1');
  });

  it('sem apiUrl usa a base padrão do gateway oficial', () => {
    const c = parseCreds({ keyId: 'K', keySecret: 'S' }) as ParsedCreds;
    expect(c.base).toBe('https://www.soliscloud.com:13333');
  });

  it('erro sem keyId/keySecret', () => {
    const r = parseCreds({ foo: 'bar' });
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toMatch(/keyId/);
  });
});

describe('normalizeBase', () => {
  it('remove barras finais; vazio → padrão', () => {
    expect(normalizeBase('https://a:13333///')).toBe('https://a:13333');
    expect(normalizeBase('')).toBe('https://www.soliscloud.com:13333');
  });
});

describe('buildSiteCredenciais', () => {
  it('grava site_id + carrega keyId/keySecret/apiUrl', () => {
    const parsed = { keyId: 'K', keySecret: 'S', base: 'https://b:13333' } as ParsedCreds;
    expect(buildSiteCredenciais(parsed, 'ST-9')).toEqual({ keyId: 'K', keySecret: 'S', apiUrl: 'https://b:13333', site_id: 'ST-9' });
  });
});

// ============================================================================
// solisSign — HMAC-SHA1 base64 do StringToSign com \n de verdade
// ============================================================================

describe('solisSign', () => {
  it('bate com o HMAC-SHA1 base64 de referência', () => {
    const md5 = 'abc==', ct = 'application/json', date = 'Wed, 01 Jul 2026 00:00:00 GMT', res = '/v1/api/userStationList';
    const esperado = crypto.createHmac('sha1', 'SECRET')
      .update(`POST\n${md5}\n${ct}\n${date}\n${res}`, 'utf8').digest('base64');
    expect(solisSign('SECRET', md5, ct, date, res)).toBe(esperado);
  });
  it('usa \\n REAL (não literal)', () => {
    const s = solisSign('S', 'm', 'application/json', 'd', '/r');
    const literal = crypto.createHmac('sha1', 'S').update('POST\\nm\\napplication/json\\nd\\n/r', 'utf8').digest('base64');
    expect(s).not.toBe(literal);
  });
});

// ============================================================================
// mesesNoIntervalo
// ============================================================================

describe('mesesNoIntervalo', () => {
  it('cobre início→fim inclusive, virando o ano', () => {
    expect(mesesNoIntervalo('2025-11-15', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('mesmo mês → 1 item', () => {
    expect(mesesNoIntervalo('2026-07-01', '2026-07-28')).toEqual(['2026-07']);
  });
});

// ============================================================================
// parseStationMonth
// ============================================================================

const monthSample = [
  { dateStr: '2026-06-29', energy: 97.3, energyStr: 'kWh' },
  { dateStr: '2026-06-30', energy: 96.8, energyStr: 'kWh' },
  { dateStr: '2026-07-01', energy: 98, energyStr: 'kWh' },
];

describe('parseStationMonth', () => {
  it('filtra o intervalo e devolve kWh/dia', () => {
    const g = parseStationMonth(monthSample, '2026-06-30', '2026-07-01');
    expect(g).toEqual([
      { data: '2026-06-30', geracao_kwh: 96.8 },
      { data: '2026-07-01', geracao_kwh: 98 },
    ]);
  });
  it('converte MWh → kWh', () => {
    const g = parseStationMonth([{ dateStr: '2026-07-01', energy: 1.2, energyStr: 'MWh' }], '2026-07-01', '2026-07-01');
    expect(g).toEqual([{ data: '2026-07-01', geracao_kwh: 1200 }]);
  });
  it('ignora energia não-numérica e data fora do padrão', () => {
    const g = parseStationMonth([{ dateStr: 'x', energy: 5 }, { dateStr: '2026-07-02', energy: null as never }], '2026-01-01', '2026-12-31');
    expect(g).toEqual([]);
  });
  it('data não-array → vazio', () => {
    expect(parseStationMonth(null, '2026-07-01', '2026-07-01')).toEqual([]);
  });
});

// ============================================================================
// capacidadeKwp
// ============================================================================

describe('capacidadeKwp', () => {
  it('kWp direto', () => expect(capacidadeKwp({ capacity: 25.85, capacityStr: 'kWp' })).toBe(25.85));
  it('MWp → ×1000', () => expect(capacidadeKwp({ capacity: 1.5, capacityStr: 'MWp' })).toBe(1500));
  it('string vira número', () => expect(capacidadeKwp({ capacity: '8.16' })).toBe(8.16));
  it('inválido → null', () => {
    expect(capacidadeKwp({ capacity: 0 })).toBeNull();
    expect(capacidadeKwp({})).toBeNull();
  });
});

// ============================================================================
// parseStationRecord
// ============================================================================

describe('parseStationRecord', () => {
  it('mapeia o registro real da usina', () => {
    const base = parseStationRecord({ id: '1298491919450591118', stationName: 'Condominio Top Master Bloco B', capacity: 25.85, capacityStr: 'kWp' });
    expect(base).toEqual({
      externalId: '1298491919450591118',
      apelido: 'Condominio Top Master Bloco B',
      potencia_kwp: 25.85,
      cidade: null,
      uf: null,
      data_instalacao: null,
    });
  });
  it('sem id → null', () => expect(parseStationRecord({ stationName: 'x' })).toBeNull());
});

// ============================================================================
// adapter — contrato
// ============================================================================

describe('solisAdapter', () => {
  it('marca é solis', () => expect(solisAdapter.marca).toBe('solis'));

  it('fetchGeneration sem site_id → invalidCredentials', async () => {
    const r = await solisAdapter.fetchGeneration({ keyId: 'K', keySecret: 'S' }, '2026-07-01', '2026-07-01');
    expect(r.ok).toBe(false);
    expect((r as { invalidCredentials?: boolean }).invalidCredentials).toBe(true);
  });

  it('fetchGeneration sem credencial → erro', async () => {
    const r = await solisAdapter.fetchGeneration({}, '2026-07-01', '2026-07-01');
    expect(r.ok).toBe(false);
  });

  it('extractAccountCreds tira o site_id, deixa keyId/keySecret/apiUrl', () => {
    const cc = solisAdapter.extractAccountCreds!({ keyId: 'K', keySecret: 'S', apiUrl: 'https://b:13333', site_id: 'ST-1' });
    expect(cc).toEqual({ keyId: 'K', keySecret: 'S', apiUrl: 'https://b:13333' });
  });

  it('extractAccountCreds null sem credencial', () => {
    expect(solisAdapter.extractAccountCreds!({ foo: 1 })).toBeNull();
  });
});
