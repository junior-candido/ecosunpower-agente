// Testa o adapter ABB (Aurora Vision). Cobre auth (Basic + ApiKey → token),
// hierarquia portfolioGroup → portfolios → plants, parse do dailyProduction
// em formatos variados, mapeamento de status pro enum unificado.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { abbAdapter, parseDailyProduction, mapearStatus } from '../src/modules/monitoring/adapters/abb.js';
import { clearAllTokens } from '../src/modules/monitoring/util/token-cache.js';

afterEach(() => {
  vi.restoreAllMocks();
  // Cache de token é module-level — sem isto, um teste reusa token cacheado por
  // outro e pula a chamada de /authenticate mockada, fazendo o fetch retornar
  // resposta do endpoint errado.
  clearAllTokens();
});

function res(status: number, jsonBody: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  } as Response;
}

const CREDS = { userId: 'inst@ecosun.com', password: 'pw123', apiKey: 'API_KEY_XYZ' };

// ============================================================================
// parseDailyProduction — normaliza variações da API
// ============================================================================

describe('parseDailyProduction', () => {
  it('aceita timestamp YYYY-MM-DD com valor em kWh pequeno', () => {
    expect(parseDailyProduction([
      { timestamp: '2026-05-27', value: 28.5 },
      { timestamp: '2026-05-28', value: 12.3 },
    ])).toEqual([
      { data: '2026-05-27', geracao_kwh: 28.5 },
      { data: '2026-05-28', geracao_kwh: 12.3 },
    ]);
  });

  it('aceita timestamp YYYYMMDD (formato compacto da API)', () => {
    expect(parseDailyProduction([
      { timestamp: '20260527', value: 28.5 },
    ])).toEqual([
      { data: '2026-05-27', geracao_kwh: 28.5 },
    ]);
  });

  it('aceita epoch (ms) e converte', () => {
    // 2026-05-27 00:00:00 UTC = 1779897600000
    expect(parseDailyProduction([
      { timestamp: 1779897600000, value: 28.5 },
    ])).toEqual([
      { data: '2026-05-27', geracao_kwh: 28.5 },
    ]);
  });

  it('converte Wh pra kWh quando valor é grande (heurística > 10000)', () => {
    expect(parseDailyProduction([
      { timestamp: '2026-05-27', value: 28500 },   // 28.5 kWh em Wh
    ])).toEqual([
      { data: '2026-05-27', geracao_kwh: 28.5 },
    ]);
  });

  it('descarta itens com value não-numérico ou null', () => {
    expect(parseDailyProduction([
      { timestamp: '2026-05-27', value: 10 },
      { timestamp: '2026-05-28', value: undefined },
      { timestamp: '2026-05-29' },
    ])).toEqual([
      { data: '2026-05-27', geracao_kwh: 10 },
    ]);
  });

  it('descarta timestamp inválido (sem corromper os válidos)', () => {
    expect(parseDailyProduction([
      { timestamp: 'lixo', value: 10 },
      { timestamp: '2026-05-28', value: 12 },
    ])).toEqual([
      { data: '2026-05-28', geracao_kwh: 12 },
    ]);
  });
});

// ============================================================================
// mapearStatus — Aurora Vision pra enum unificado
// ============================================================================

describe('mapearStatus', () => {
  it('plantState=INACTIVE → offline (planta desligada na origem)', () => {
    expect(mapearStatus('NORM', 'INACTIVE')).toBe('offline');
    expect(mapearStatus(undefined, 'INACTIVE')).toBe('offline');
  });

  it('plantStatus=NORM ou OK → ok', () => {
    expect(mapearStatus('NORM', 'ACTIVE')).toBe('ok');
    expect(mapearStatus('OK', 'ACTIVE')).toBe('ok');
  });

  it('LOW/MEDIUM/HIGH = ok (sao alertas de GERACAO baixa, nao falha de equipamento)', () => {
    // Em Aurora Vision LOW/MED/HIGH indicam quanto a producao esta abaixo do
    // esperado por causa de nuvem/sujeira/clima. Marcar como 'falha' poluiria
    // o dashboard em dia nublado. Eva detecta sub-geracao no S3/S4 com
    // baseline PVGIS proprio (mais preciso por regiao+marca).
    expect(mapearStatus('LOW', 'ACTIVE')).toBe('ok');
    expect(mapearStatus('MEDIUM', 'ACTIVE')).toBe('ok');
    expect(mapearStatus('HIGH', 'ACTIVE')).toBe('ok');
  });

  it('FAULT/ERROR/COMM_FAIL/WARN → falha (problema EXPLICITO de equipamento)', () => {
    expect(mapearStatus('FAULT', 'ACTIVE')).toBe('falha');
    expect(mapearStatus('ERROR', 'ACTIVE')).toBe('falha');
    expect(mapearStatus('COMM_FAIL', 'ACTIVE')).toBe('falha');
    expect(mapearStatus('WARN', 'ACTIVE')).toBe('falha');
    expect(mapearStatus('ALARM', 'ACTIVE')).toBe('falha');
  });

  it('vazio total → desconhecido', () => {
    expect(mapearStatus(undefined, undefined)).toBe('desconhecido');
    expect(mapearStatus('', '')).toBe('desconhecido');
  });

  it('ACTIVE sem status definido → ok (otimista — planta tá viva)', () => {
    expect(mapearStatus(undefined, 'ACTIVE')).toBe('ok');
  });
});

// ============================================================================
// LIST SITES — flow portfolioGroup → portfolios → plants
// ============================================================================

describe('abbAdapter.listSites', () => {
  it('rejeita credenciais incompletas com invalidCredentials', async () => {
    const r = await abbAdapter.listSites!({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });

  it('hidrata sites a partir do flow auth → portfolioGroup → plants', async () => {
    let stage = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      stage++;
      if (stage === 1) {
        expect(url).toContain('/authenticate');
        return res(200, { result: 'TOKEN_ABC' });
      }
      if (stage === 2) {
        expect(url).toContain('/v1/portfolioGroup');
        return res(200, { result: {
          portfolioGroupEntityID: 11,
          portfolioGroupName: 'Org',
          portfolioGroupPortfolios: [{ portfolioEntityID: 22, portfolioName: 'P1' }],
        }});
      }
      // página 0 do portfolio 22
      if (stage === 3) {
        expect(url).toContain('/v1/portfolio/22/plants');
        return res(200, { result: [
          { plantEntityID: 1001, plantName: 'Loja A', plantPeakPower: 38.25, plantAddress: { city: 'Brasilia', state: 'DF' } },
          { plantEntityID: 1002, plantName: 'Loja B', plantPeakPower: 12.6, plantAddress: { city: 'Goiania', state: 'GO' } },
        ]});
      }
      // página 1 vazia → encerra
      return res(200, { result: [] });
    }));

    const r = await abbAdapter.listSites!(CREDS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sites).toHaveLength(2);
    expect(r.sites[0]).toMatchObject({
      externalId: '1001',
      apelido: 'Loja A',
      potencia_kwp: 38.25,
      cidade: 'Brasilia',
      uf: 'DF',
    });
    // Credenciais por planta carregam plantEntityID pra usar em fetchGeneration
    expect(r.sites[0].credenciais).toMatchObject({
      userId: CREDS.userId,
      apiKey: CREDS.apiKey,
      plantEntityID: '1001',
    });
  });

  it('401 no /authenticate marca invalidCredentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(401, { error: 'bad creds' })));
    const r = await abbAdapter.listSites!(CREDS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });

  it('retorna [] quando o portfolioGroup nao tem portfolios', async () => {
    let stage = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      stage++;
      if (stage === 1) return res(200, { result: 'TOKEN' });
      return res(200, { result: { portfolioGroupEntityID: 1, portfolioGroupPortfolios: [] } });
    }));
    const r = await abbAdapter.listSites!(CREDS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sites).toEqual([]);
  });
});

// ============================================================================
// FETCH GENERATION — dailyProduction + status num único caminho
// ============================================================================

describe('abbAdapter.fetchGeneration', () => {
  it('exige plantEntityID nas credenciais', async () => {
    const r = await abbAdapter.fetchGeneration(CREDS, '2026-05-01', '2026-05-31');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
    expect(r.reason).toMatch(/plantEntityID/i);
  });

  it('agrega geração e status num único fluxo (auth + dailyProduction + status)', async () => {
    let stage = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      stage++;
      if (stage === 1) return res(200, { result: 'TOKEN' });
      if (stage === 2) {
        expect(url).toContain('/v1/plant/1001/dailyProduction');
        expect(url).toContain('startDate=20260501');
        expect(url).toContain('endDate=20260531');
        return res(200, { result: {
          plantEntityID: 1001,
          dailyProduction: [
            { timestamp: '2026-05-27', value: 28.5 },
            { timestamp: '2026-05-28', value: 12.3 },
          ],
        }});
      }
      // status
      expect(url).toContain('/v1/plant/1001/status');
      return res(200, { result: { plantState: 'ACTIVE', plantStatus: 'NORM' } });
    }));

    const r = await abbAdapter.fetchGeneration(
      { ...CREDS, plantEntityID: '1001' },
      '2026-05-01', '2026-05-31',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([
      { data: '2026-05-27', geracao_kwh: 28.5 },
      { data: '2026-05-28', geracao_kwh: 12.3 },
    ]);
    expect(r.statusInversor).toBe('ok');
  });

  it('falha de status nao bloqueia geracao — statusInversor=desconhecido', async () => {
    let stage = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      stage++;
      if (stage === 1) return res(200, { result: 'TOKEN' });
      if (stage === 2) {
        return res(200, { result: {
          plantEntityID: 1001,
          dailyProduction: [{ timestamp: '2026-05-28', value: 10 }],
        }});
      }
      // status falhou (500)
      return res(500, { error: 'oops' });
    }));
    const r = await abbAdapter.fetchGeneration(
      { ...CREDS, plantEntityID: '1001' },
      '2026-05-28', '2026-05-28',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toHaveLength(1);
    expect(r.statusInversor).toBe('desconhecido');
  });
});
