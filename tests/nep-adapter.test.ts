// Testa o adapter NEP. Cobre o algoritmo de sign (mais sensível — qualquer
// regressão deixa todo o adapter em 401/sign-invalid), parse das respostas
// listWithSN + statistics/echarts, e a heurística de statusInversor pra
// microinversor distribuído.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { nepAdapter, nepSign } from '../src/modules/monitoring/adapters/nep.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function res(status: number, jsonBody: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  } as Response;
}

// ============================================================================
// SIGN — algoritmo extraído do JS minificado do NEPViewer
// ============================================================================

describe('nepSign', () => {
  // Os 6 pares (body, sign) capturados no HAR de 28/05/2026. Se algum dia o
  // app NEP mudar o algoritmo, esses testes vão pegar.
  const SAMPLES: Array<[unknown, string]> = [
    [{}, '99914B932BD37A50B983C5E7C90AE93B'],
    [{ sid: 'BR_20260323_Whbh' }, '5EDDDFA7CD55C1B2FCED0B78326E970E'],
    [{ types: 6, sid: 'BR_20260323_Whbh' }, '016B53F59D082988087D0E0D54303E58'],
    [
      { types: 3, rangeDate: '2026-05-01~2026-05-31', sid: 'BR_20260323_Whbh' },
      '9108C506A8C2E631C88FE004F14FCA85',
    ],
    [
      { types: 11, weatherHours: false, rangeDate: '2026-05-28', date: '2026-05-28', sid: 'BR_20260323_Whbh' },
      '1F672A5F69929528ED8B05CACA93FE0C',
    ],
    [
      {
        page: { size: 10, num: 0 },
        filters: {
          keywords: '', site_name: '', user_email: '', installer_email: '',
          country_code: '', created_start_date: '', created_end_date: '', street: '',
        },
        sort: [],
      },
      'C513D70171FB45FD85BE759FABDC6715',
    ],
  ];

  for (const [body, esperado] of SAMPLES) {
    it(`bate sign do HAR para ${JSON.stringify(body).slice(0, 50)}...`, () => {
      expect(nepSign(body)).toBe(esperado);
    });
  }

  it('substitui letra "e" minúscula por "NEP" (única particularidade do algoritmo)', () => {
    // Sem o replace de `e -> NEP`, MD5({"types":3,...}) NÃO bate. O replace
    // é a parte que não-óbvia — guardar pra que regressão fique imediata.
    expect(nepSign({ types: 3, sid: 'BR_20260323_Whbh' })).not.toBe(
      // MD5(JSON.stringify({"types":3,"sid":"BR_20260323_Whbh"})) sem substituir e
      'A5113A505455422E128F43ADB53AB7F0',
    );
  });
});

// ============================================================================
// LIST SITES
// ============================================================================

function plantaFake(overrides: Partial<{
  sid: string; siteName: string; city: string; stateName: string;
  registerDate: string;
  sns: Array<{ sn: string; model: string; status: number; alertCode: string }>;
}> = {}) {
  return {
    sid: overrides.sid ?? 'BR_20260323_Whbh',
    siteName: overrides.siteName ?? 'Henrique e Sonia',
    country: 'BR',
    countryName: 'Brazil',
    stateName: overrides.stateName ?? 'Acre',
    city: overrides.city ?? 's',
    street: '',
    userEmail: 'cliente@x.com',
    installerEmail: 'ecosunpower@x.com',
    registerDate: overrides.registerDate ?? '23/03/2026 21:12',
    snCount: (overrides.sns ?? []).length,
    sn: (overrides.sns ?? []).map((s) => ({
      sid: overrides.sid ?? 'BR_20260323_Whbh',
      sn: s.sn, model: s.model, status: s.status,
      statusTitle: s.status === 0 ? 'online' : 'offline',
      alertCode: s.alertCode, alertTitle: 'x', alertDescription: 'x',
      lastUpdate: '', lastUpdateTime: 0,
      now: 0, todayPower: 0, totalPower: 0,
      nowUnit: 'W', todayPowerUnit: 'kWh', totalPowerUnit: 'kWh',
    })),
  };
}

describe('nepAdapter.listSites', () => {
  it('parseia plantas + estima kWp a partir do modelo BDM-NNNN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      res(200, {
        code: 200, msg: 'ok',
        data: {
          list: [
            plantaFake({
              sid: 'BR_001', siteName: 'Casa A',
              sns: [
                { sn: 'A1', model: 'BDM-2250', status: 0, alertCode: '0000' },
                { sn: 'A2', model: 'BDM-2250', status: 0, alertCode: '0000' },
              ],
            }),
            plantaFake({
              sid: 'BR_002', siteName: 'Casa B', city: 'Brasilia',
              registerDate: '15/04/2026 21:12',
              sns: [
                { sn: 'B1', model: 'BDM-1200', status: 0, alertCode: '0000' },
              ],
            }),
          ],
        },
      })));

    const r = await nepAdapter.listSites!({ jwt: 'fake-jwt' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sites).toHaveLength(2);
    expect(r.sites[0]).toMatchObject({
      externalId: 'BR_001',
      apelido: 'Casa A',
      potencia_kwp: 4.5,        // 2 × BDM-2250 = 2 × 2.25 = 4.5 kW
      data_instalacao: '2026-03-23',
    });
    expect(r.sites[1]).toMatchObject({
      externalId: 'BR_002',
      potencia_kwp: 1.2,        // 1 × BDM-1200 = 1.2 kW
      cidade: 'Brasilia',
      data_instalacao: '2026-04-15',
    });
  });

  it('credenciais geradas reaproveitam o jwt + injetam site_id pra fetchGeneration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      res(200, { code: 200, msg: 'ok', data: { list: [plantaFake({ sid: 'BR_x' })] } })));

    const r = await nepAdapter.listSites!({ jwt: 'eyJfake' });
    if (!r.ok) throw new Error('listSites falhou');
    // Padrão do registry: chave `site_id` (NÃO `sid`) — é por ela que o
    // service.ts deduplica. Gravar `sid` era o bug que duplicava as plantas.
    expect(r.sites[0].credenciais).toEqual({ jwt: 'eyJfake', site_id: 'BR_x' });
  });

  it('rejeita credenciais sem jwt nem email/password com invalidCredentials', async () => {
    const r = await nepAdapter.listSites!({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });

  it('401 do NEP marca invalidCredentials (Junior precisa atualizar JWT)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(401, {})));
    const r = await nepAdapter.listSites!({ jwt: 'expirado' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });

  it('encerra paginação quando a página retorna menos que PAGE_SIZE', async () => {
    const fetchMock = vi.fn(async () =>
      res(200, { code: 200, msg: 'ok', data: { list: [plantaFake({ sid: 'BR_A' })] } }));
    vi.stubGlobal('fetch', fetchMock);
    await nepAdapter.listSites!({ jwt: 'x' });
    // 1 página só (1 item < PAGE_SIZE 50) -> 1 chamada
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// FETCH GENERATION
// ============================================================================

describe('nepAdapter.fetchGeneration', () => {
  it('agrega series por dia: soma valores por índice, ignora null', async () => {
    let callIdx = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      callIdx++;
      if (callIdx === 1) {
        // primeira chamada = echarts (geração diária)
        return res(200, {
          code: 200, msg: 'ok',
          data: {
            legend: ['Power Generation'],
            xAxisData: ['01/05', '02/05', '03/05'],
            series: [
              { name: 'SN_A', data: [10, 12, null] },
              { name: 'SN_B', data: [5, null, 8] },
              { name: 'SN_C', data: [null, null, null] },
            ],
          },
        });
      }
      // segunda chamada = listWithSN (pra statusInversor)
      return res(200, { code: 200, msg: 'ok', data: { list: [] } });
    }));

    const r = await nepAdapter.fetchGeneration(
      { jwt: 'x', sid: 'BR_X' },
      '2026-05-01',
      '2026-05-31',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([
      { data: '2026-05-01', geracao_kwh: 15 },   // 10 + 5
      { data: '2026-05-02', geracao_kwh: 12 },   // 12 + null
      { data: '2026-05-03', geracao_kwh: 8 },    // null + 8
    ]);
  });

  it('filtra dias com geração zero (NEP devolve null pra dias futuros do mês corrente)', async () => {
    let callIdx = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callIdx++;
      if (callIdx === 1) {
        return res(200, {
          code: 200, msg: 'ok',
          data: {
            legend: ['Power Generation'],
            xAxisData: ['28/05', '29/05', '30/05', '31/05'],
            series: [
              { name: 'SN_A', data: [12.5, null, null, null] },
            ],
          },
        });
      }
      return res(200, { code: 200, msg: 'ok', data: { list: [] } });
    }));

    const r = await nepAdapter.fetchGeneration(
      { jwt: 'x', sid: 'BR_X' },
      '2026-05-01',
      '2026-05-31',
    );
    if (!r.ok) throw new Error(r.reason);
    // Só 28/05 tem geração > 0; 29-31 são futuros (null) e devem sumir
    expect(r.geracoes).toEqual([{ data: '2026-05-28', geracao_kwh: 12.5 }]);
  });

  it('exige sid nas credenciais (sem sid, qual planta consultar?)', async () => {
    const r = await nepAdapter.fetchGeneration({ jwt: 'x' }, '2026-05-01', '2026-05-31');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
    expect(r.reason).toMatch(/sid/i);
  });
});

// ============================================================================
// STATUS INVERSOR — derivado das series do echarts (sem chamada extra)
// ============================================================================

describe('statusInversor derivado do echarts', () => {
  function setupFetchComSeries(series: Array<Array<number | null>>) {
    return vi.fn(async () =>
      res(200, {
        code: 200, msg: 'ok',
        data: {
          legend: ['Power Generation'],
          xAxisData: ['27/05', '28/05'],
          series: series.map((data, i) => ({ name: `SN_${i}`, data })),
        },
      }));
  }

  async function runStatus(series: Array<Array<number | null>>) {
    vi.stubGlobal('fetch', setupFetchComSeries(series));
    const r = await nepAdapter.fetchGeneration({ jwt: 'x', sid: 'BR_X' }, '2026-05-27', '2026-05-28');
    if (!r.ok) throw new Error(r.reason);
    return r.statusInversor;
  }

  it('todos SNs com geração > 0 no último dia com leitura = ok', async () => {
    expect(await runStatus([
      [10, 12],
      [8, 9],
    ])).toBe('ok');
  });

  it('TODOS SNs null/0 no último dia com leitura = offline (planta morta)', async () => {
    expect(await runStatus([
      [10, 0],
      [8, 0],
    ])).toBe('offline');
  });

  it('ALGUNS SNs null/0 + outros gerando = falha parcial (planta segue gerando)', async () => {
    expect(await runStatus([
      [10, 12],
      [8, null],
      [5, 6],
    ])).toBe('falha');
  });

  // Edge case 1-SN: [10, null] é AMBÍGUO sem contexto temporal (dia null pode
  // ser "futuro ainda não rodou" OU "SN morreu hoje"). A heurística do echarts
  // assume futuro (recua pro último dia com leitura). No próximo ciclo de cron,
  // se o SN continuar null, o range já não tem dia anterior com leitura →
  // statusInversor='desconhecido' → Eva avisa. Trade-off aceito: zero detecção
  // em 1 ciclo, detecção no 2º. Vale a economia de não chamar listWithSN extra.

  it('séries totalmente vazias (planta nova, dias futuros, etc) = desconhecido', async () => {
    expect(await runStatus([
      [null, null],
      [null, null],
    ])).toBe('desconhecido');
  });

  it('ignora dias futuros (null no fim): usa o último dia com leitura, não o último índice', async () => {
    // Hoje é 28/05; planta gerou 27/05 mas dia 28 ainda nao rodou (null em todas).
    // Status deve refletir 27/05 (algum gerou) = ok, não 28/05 (todos null = offline).
    vi.stubGlobal('fetch', vi.fn(async () =>
      res(200, {
        code: 200, msg: 'ok',
        data: {
          legend: [], xAxisData: ['27/05', '28/05'],
          series: [{ name: 'A', data: [10, null] }, { name: 'B', data: [8, null] }],
        },
      })));
    const r = await nepAdapter.fetchGeneration({ jwt: 'x', sid: 'BR_X' }, '2026-05-27', '2026-05-28');
    if (!r.ok) throw new Error(r.reason);
    expect(r.statusInversor).toBe('ok');
  });
});

// ============================================================================
// YEAR-BOUNDARY — virada de ano dentro do range
// ============================================================================

describe('fetchGeneration year-boundary', () => {
  it('detecta wrap mês-pra-trás e incrementa ano (28/12/2026 → 01/01/2027)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      res(200, {
        code: 200, msg: 'ok',
        data: {
          legend: [],
          xAxisData: ['28/12', '29/12', '30/12', '31/12', '01/01', '02/01'],
          series: [{ name: 'A', data: [10, 11, 12, 13, 8, 9] }],
        },
      })));
    const r = await nepAdapter.fetchGeneration({ jwt: 'x', sid: 'BR_X' }, '2026-12-28', '2027-01-02');
    if (!r.ok) throw new Error(r.reason);
    const datas = r.geracoes.map((g) => g.data);
    expect(datas).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
      '2027-01-01', '2027-01-02',
    ]);
  });
});

// ============================================================================
// FILTER ZERO — preserva 0 kWh real (planta com defeito), dropa só dias sem leitura
// ============================================================================

describe('fetchGeneration preserva 0 kWh real', () => {
  it('mantém dia com 0 kWh quando ao menos uma série reportou número (defeito real)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      res(200, {
        code: 200, msg: 'ok',
        data: {
          legend: [], xAxisData: ['25/05', '26/05', '27/05', '28/05'],
          // dia 25: defeito (0); 26: ok; 27: planta offline (todos null); 28: futuro (null)
          series: [
            { name: 'A', data: [0, 12, null, null] },
            { name: 'B', data: [0, 8, null, null] },
          ],
        },
      })));
    const r = await nepAdapter.fetchGeneration({ jwt: 'x', sid: 'BR_X' }, '2026-05-25', '2026-05-28');
    if (!r.ok) throw new Error(r.reason);
    // 25 e 26 entram. 27 e 28 saem (todas null).
    expect(r.geracoes).toEqual([
      { data: '2026-05-25', geracao_kwh: 0 },
      { data: '2026-05-26', geracao_kwh: 20 },
    ]);
  });
});

// ============================================================================
// CREDENCIAIS — modo email+password rejeitado até /sign-in ser mapeado
// ============================================================================

describe('parseCreds rejeita modo email+password (signIn nao mapeado)', () => {
  it('email+password explica que o modo nao esta pronto', async () => {
    const r = await nepAdapter.listSites!({ email: 'x@y.com', password: 'abc' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
    expect(r.reason).toMatch(/sign-in|jwt/i);
  });
});

// ============================================================================
// PAGINATION RESILIENTE
// ============================================================================

describe('listSites paginação resiliente', () => {
  it('retorna partial se erro generico em pagina intermediaria (perda zero)', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++;
      if (call === 1) {
        // página 0 cheia (50 plantas — força o loop a pedir mais uma)
        const lista = Array.from({ length: 50 }, (_, i) =>
          plantaFake({ sid: `BR_${i}`, siteName: `P${i}` }));
        return res(200, { code: 200, msg: 'ok', data: { list: lista } });
      }
      // página 1 erro
      return res(500, {});
    }));

    const r = await nepAdapter.listSites!({ jwt: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sites).toHaveLength(50); // partial recovery
  });

  it('erro de credencial (401) NAO faz partial (auth quebrou em definitivo)', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++;
      if (call === 1) {
        const lista = Array.from({ length: 50 }, (_, i) =>
          plantaFake({ sid: `BR_${i}`, siteName: `P${i}` }));
        return res(200, { code: 200, msg: 'ok', data: { list: lista } });
      }
      return res(401, {});
    }));
    const r = await nepAdapter.listSites!({ jwt: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });

  it('para com warning se API devolve code:200 mas data.list ausente (vez de loop infinito silencioso)', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++;
      if (call === 1) {
        const lista = Array.from({ length: 50 }, (_, i) =>
          plantaFake({ sid: `BR_${i}` }));
        return res(200, { code: 200, msg: 'ok', data: { list: lista } });
      }
      // anomalia: 200 sem list
      return res(200, { code: 200, msg: 'ok', data: {} });
    }));
    const r = await nepAdapter.listSites!({ jwt: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sites).toHaveLength(50);
  });
});
