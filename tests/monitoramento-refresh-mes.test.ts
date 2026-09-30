// Refresh do MÊS 1×/dia (29/09): além da janela de 7 dias a cada 15 min, a
// primeira rodada depois das 05:00 de Brasília re-busca o mês corrente E o
// anterior de cada usina — datalogger que subiu atrasado / fabricante que
// recalculou fica corrigido e o total do mês bate com o app.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const adapters: Record<string, any> = {};
vi.mock('../src/modules/monitoring/adapter-registry.js', () => ({
  getAdapter: (m: string) => adapters[m] ?? null,
  marcasSuportadas: () => Object.keys(adapters),
}));

import { MonitoringService } from '../src/modules/monitoring/service.js';
import { inicioMesAnteriorBrasilia, horaBrasilia, janelaRefreshMes } from '../src/modules/monitoring/util/dia-brasilia.js';

interface Estado { sistemas: any[]; upserts: any[]; updates: Array<{ fields: any; id?: string }> }

function fakeSupabase(e: Estado) {
  return {
    getClient() {
      return {
        from(tabela: string) {
          const filtros: Record<string, unknown> = {};
          let pendingUpdate: any = null;
          const q: any = {
            select() { return q; },
            eq(col: string, v: unknown) {
              filtros[col] = v;
              if (pendingUpdate && col === 'id') e.updates.push({ fields: pendingUpdate, id: String(v) });
              return q;
            },
            gt() { return q; }, order() { return q; }, limit() { return q; },
            upsert(rows: any[]) { e.upserts.push(...rows); return Promise.resolve({ error: null }); },
            update(fields: any) { pendingUpdate = fields; return q; },
            then(res: any, rej?: any) {
              let data: any = [];
              if (pendingUpdate) data = null;
              else if (tabela === 'sistemas_clientes') data = e.sistemas;
              else if (tabela === 'geracao_diaria') data = [{ data: '2026-09-28' }];
              return Promise.resolve({ data, error: null }).then(res, rej);
            },
          };
          return q;
        },
      };
    },
  } as any;
}

const sis = (id: string, marca: string) => ({
  id, apelido: id, marca_inversor: marca, ativo: true, company_id: 'emp-1',
  api_credentials: { site_id: id, api_key: 'KEY-A' }, potencia_kwp: 5,
});

function adapterOk(dias: string[] = ['2026-09-28', '2026-09-29']) {
  return { fetchGeneration: vi.fn().mockResolvedValue({ ok: true, geracoes: dias.map((d) => ({ data: d, geracao_kwh: 10 })) }) };
}

const janelas = (fn: any) => fn.mock.calls.map((c: any[]) => `${c[1]}..${c[2]}`);

beforeEach(() => {
  for (const k of Object.keys(adapters)) delete adapters[k];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('helpers de calendário', () => {
  it('mês anterior em Brasília, inclusive virada de ano e 21h+ (UTC já é amanhã)', () => {
    expect(inicioMesAnteriorBrasilia(new Date('2026-09-29T12:00:00Z'))).toBe('2026-08-01');
    expect(inicioMesAnteriorBrasilia(new Date('2027-01-05T12:00:00Z'))).toBe('2026-12-01');
    // 30/09 22h BRT = 01/10 01h UTC → ainda é setembro em Brasília
    expect(inicioMesAnteriorBrasilia(new Date('2026-10-01T01:00:00Z'))).toBe('2026-08-01');
    expect(janelaRefreshMes(new Date('2026-10-01T09:00:00Z'))).toEqual({ dataInicio: '2026-09-01', dataFim: '2026-10-01' });
  });

  it('hora de Brasília (UTC-3)', () => {
    expect(horaBrasilia(new Date('2026-09-29T07:59:00Z'))).toBe(4);
    expect(horaBrasilia(new Date('2026-09-29T08:00:00Z'))).toBe(5);
    expect(horaBrasilia(new Date('2026-09-30T02:30:00Z'))).toBe(23);
  });
});

describe('syncAll — refresh do mês 1×/dia', () => {
  it('antes das 05:00 de Brasília: só a janela de 7 dias', async () => {
    vi.setSystemTime(new Date('2026-09-29T07:50:00Z')); // 04:50 BRT
    adapters.deye = adapterOk();
    const svc = new MonitoringService(fakeSupabase({ sistemas: [sis('d1', 'deye')], upserts: [], updates: [] }));
    await svc.syncAll();
    expect(janelas(adapters.deye.fetchGeneration)).toEqual(['2026-09-22..2026-09-29']);
  });

  it('1ª rodada depois das 05:00 busca mês anterior + corrente; as seguintes voltam pra 7 dias; no dia seguinte repete', async () => {
    adapters.deye = adapterOk();
    const e: Estado = { sistemas: [sis('d1', 'deye'), sis('d2', 'deye')], upserts: [], updates: [] };
    const svc = new MonitoringService(fakeSupabase(e));

    vi.setSystemTime(new Date('2026-09-29T08:05:00Z')); // 05:05 BRT
    const r = await svc.syncAll();
    expect(janelas(adapters.deye.fetchGeneration)).toEqual(['2026-08-01..2026-09-29', '2026-08-01..2026-09-29']);
    expect(r.refreshMes).toBe(2);

    adapters.deye.fetchGeneration.mockClear();
    vi.setSystemTime(new Date('2026-09-29T08:20:00Z'));
    const r2 = await svc.syncAll();
    expect(janelas(adapters.deye.fetchGeneration)).toEqual(['2026-09-22..2026-09-29', '2026-09-22..2026-09-29']);
    expect(r2.refreshMes ?? 0).toBe(0);

    adapters.deye.fetchGeneration.mockClear();
    vi.setSystemTime(new Date('2026-09-30T08:10:00Z')); // dia seguinte 05:10 BRT
    await svc.syncAll();
    expect(janelas(adapters.deye.fetchGeneration)).toEqual(['2026-08-01..2026-09-30', '2026-08-01..2026-09-30']);
  });

  it('falha na busca do mês não repete a cada 15 min (1 tentativa por dia)', async () => {
    adapters.goodwe = { fetchGeneration: vi.fn().mockResolvedValue({ ok: false, reason: 'GoodWe fora' }) };
    const svc = new MonitoringService(fakeSupabase({ sistemas: [sis('g1', 'goodwe')], upserts: [], updates: [] }));
    vi.setSystemTime(new Date('2026-09-29T08:05:00Z'));
    await svc.syncAll();
    vi.setSystemTime(new Date('2026-09-29T08:20:00Z'));
    await svc.syncAll();
    expect(janelas(adapters.goodwe.fetchGeneration)).toEqual(['2026-08-01..2026-09-29', '2026-09-22..2026-09-29']);
  });

  it('falha parcial no refresh do mês segue a régua: ultimo_erro e sem "sincronizado agora"', async () => {
    adapters.foxess = { fetchGeneration: vi.fn().mockResolvedValue({ ok: true, geracoes: [{ data: '2026-09-29', geracao_kwh: 3 }], falhaParcial: 'mês 2026-08 não respondeu' }) };
    const e: Estado = { sistemas: [sis('f1', 'foxess')], upserts: [], updates: [] };
    vi.setSystemTime(new Date('2026-09-29T08:05:00Z'));
    const r = await new MonitoringService(fakeSupabase(e)).syncAll();
    expect(r.falhas).toBe(1);
    const ups = e.updates.filter((u) => u.id === 'f1');
    expect(ups.some((u) => /mês 2026-08/.test(String(u.fields.ultimo_erro)))).toBe(true);
    expect(ups.some((u) => 'ultima_sincronizacao' in u.fields)).toBe(false);
    expect(e.upserts.map((x) => x.data)).toEqual(['2026-09-29']);
  });

  it('SolarEdge: o refresh do mês usa a MESMA consulta da hora (nenhuma chamada a mais na cota)', async () => {
    adapters.solaredge = adapterOk();
    const svc = new MonitoringService(fakeSupabase({ sistemas: [sis('s1', 'solaredge')], upserts: [], updates: [] }));

    vi.setSystemTime(new Date('2026-09-29T07:40:00Z')); // 04:40 BRT — janela normal
    await svc.syncAll();
    vi.setSystemTime(new Date('2026-09-29T08:10:00Z')); // 05:10 — ainda dentro da 1 h: pula
    await svc.syncAll();
    vi.setSystemTime(new Date('2026-09-29T08:45:00Z')); // 05:45 — 1 h passou: vem o mês
    await svc.syncAll();
    vi.setSystemTime(new Date('2026-09-29T09:50:00Z')); // 06:50 — volta ao normal
    await svc.syncAll();

    expect(janelas(adapters.solaredge.fetchGeneration)).toEqual([
      '2026-09-22..2026-09-29',
      '2026-08-01..2026-09-29',
      '2026-09-22..2026-09-29',
    ]);
  });
});

// 30/09/2026 — limite de consultas do fabricante (GoodWe 429): o refresh do mês
// interrompido NÃO fica marcado como feito (tenta de novo na próxima rodada) e
// nada vira "erro de integração".
describe('syncAll — adiado por limite do fabricante', () => {
  it('refresh do mês adiado tenta de novo na rodada seguinte', async () => {
    adapters.goodwe = { fetchGeneration: vi.fn().mockResolvedValue({ ok: true, geracoes: [], adiadoPorLimite: true }) };
    const svc = new MonitoringService(fakeSupabase({ sistemas: [sis('g1', 'goodwe')], upserts: [], updates: [] }));
    vi.setSystemTime(new Date('2026-09-29T08:05:00Z'));
    await svc.syncAll();
    vi.setSystemTime(new Date('2026-09-29T08:20:00Z'));
    await svc.syncAll();
    expect(janelas(adapters.goodwe.fetchGeneration)).toEqual(['2026-08-01..2026-09-29', '2026-08-01..2026-09-29']);
  });

  it('adiado sem nenhum dia: não grava erro nem conta como falha', async () => {
    adapters.goodwe = { fetchGeneration: vi.fn().mockResolvedValue({ ok: true, geracoes: [], adiadoPorLimite: true }) };
    const e: Estado = { sistemas: [sis('g1', 'goodwe')], upserts: [], updates: [] };
    vi.setSystemTime(new Date('2026-09-29T08:05:00Z'));
    const r = await new MonitoringService(fakeSupabase(e)).syncAll();
    expect(r.falhas).toBe(0);
    expect(e.updates.filter((u) => u.id === 'g1').some((u) => u.fields.ultimo_erro)).toBe(false);
  });

  it('adiado com parte dos dias: grava o que veio e fica OK (sem erro)', async () => {
    adapters.goodwe = { fetchGeneration: vi.fn().mockResolvedValue({ ok: true, geracoes: [{ data: '2026-09-29', geracao_kwh: 30 }], adiadoPorLimite: true }) };
    const e: Estado = { sistemas: [sis('g1', 'goodwe')], upserts: [], updates: [] };
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    const r = await new MonitoringService(fakeSupabase(e)).syncAll();
    expect(r.falhas).toBe(0);
    expect(e.upserts.map((x) => x.data)).toEqual(['2026-09-29']);
    const ups = e.updates.filter((u) => u.id === 'g1');
    expect(ups.some((u) => u.fields.ultimo_erro)).toBe(false);
  });
});
