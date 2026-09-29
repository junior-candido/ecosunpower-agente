// tests/monitoramento-sync-confiavel.test.ts
// Sync do monitoramento que NÃO mente (auditoria 29/09):
//   1. calendário de Brasília — às 23h59 do dia 30 não pede nem grava o dia 01
//   3. falha parcial / portal vazio → ultimo_erro claro, ultima_sincronizacao intocada
//   4. SolarEdge no máximo 1×/hora por usina; 429 pausa a chave (sem martelar)
//   5. descoberta não sobrescreve kWp nem religa usina pausada à mão
//   6. trava: uma rodada não começa enquanto a anterior ainda roda
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const adapters: Record<string, any> = {};
vi.mock('../src/modules/monitoring/adapter-registry.js', () => ({
  getAdapter: (m: string) => adapters[m] ?? null,
  marcasSuportadas: () => Object.keys(adapters),
}));

import { MonitoringService } from '../src/modules/monitoring/service.js';

interface Estado {
  sistemas: any[];
  ultimaGeracao: Record<string, string | null>; // sistema_id → última data com geração>0
  upserts: any[];
  updates: Array<{ tabela: string; fields: any; id?: string }>;
  inserts: any[];
  existentePorSite?: any;
}

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
              if (pendingUpdate && col === 'id') e.updates.push({ tabela, fields: pendingUpdate, id: String(v) });
              return q;
            },
            gt() { return q; },
            in() { return q; },
            gte() { return q; },
            order() { return q; },
            range() { return q; },
            limit() { return q; },
            upsert(rows: any[]) { e.upserts.push(...rows); return Promise.resolve({ error: null }); },
            insert(row: any) { e.inserts.push(row); return Promise.resolve({ error: null }); },
            update(fields: any) { pendingUpdate = fields; return q; },
            maybeSingle() {
              if (tabela === 'sistemas_clientes' && filtros['api_credentials->>site_id']) {
                return Promise.resolve({ data: e.existentePorSite ?? null, error: null });
              }
              if (tabela === 'sistemas_clientes' && filtros.id) {
                return Promise.resolve({ data: e.sistemas.find((s) => s.id === filtros.id) ?? null, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            },
            then(res: any, rej?: any) {
              let data: any = null;
              if (pendingUpdate) data = null;
              else if (tabela === 'sistemas_clientes') {
                data = e.sistemas.filter((s) => !filtros.marca_inversor || s.marca_inversor === filtros.marca_inversor);
              } else if (tabela === 'geracao_diaria') {
                const sid = String(filtros.sistema_id ?? '');
                const d = e.ultimaGeracao[sid];
                data = d ? [{ data: d }] : [];
              } else data = [];
              return Promise.resolve({ data, error: null }).then(res, rej);
            },
          };
          return q;
        },
      };
    },
  } as any;
}

function estado(sistemas: any[], ultimaGeracao: Record<string, string | null> = {}): Estado {
  return { sistemas, ultimaGeracao, upserts: [], updates: [], inserts: [] };
}

const sis = (id: string, marca: string, extra: any = {}) => ({
  id, apelido: id, marca_inversor: marca, ativo: true, company_id: 'emp-1',
  api_credentials: { site_id: id, api_key: 'KEY-A' }, potencia_kwp: 5, ...extra,
});

const statusUpd = (e: Estado, id: string) => e.updates.filter((u) => u.tabela === 'sistemas_clientes' && u.id === id);

beforeEach(() => {
  for (const k of Object.keys(adapters)) delete adapters[k];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('syncAll — calendário de Brasília', () => {
  it('às 23h59 do dia 30 (Brasília) pede até 30/09 e nunca grava 01/10', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T02:59:00Z')); // 30/09 23:59 BRT
    const fetchGeneration = vi.fn().mockResolvedValue({
      ok: true,
      geracoes: [
        { data: '2026-09-29', geracao_kwh: 20 },
        { data: '2026-09-30', geracao_kwh: 18 },
        { data: '2026-10-01', geracao_kwh: 0 }, // dia que ainda não existe
      ],
    });
    adapters.deye = { fetchGeneration };
    const e = estado([sis('s1', 'deye')], { s1: '2026-09-30' });
    await new MonitoringService(fakeSupabase(e)).syncAll();
    // 1ª rodada do dia depois das 05:00 → refresh do mês (anterior + corrente),
    // ainda no calendário de Brasília: começa em 01/08 e termina em 30/09.
    expect(fetchGeneration.mock.calls[0][1]).toBe('2026-08-01');
    expect(fetchGeneration.mock.calls[0][2]).toBe('2026-09-30');
    expect(e.upserts.map((r) => r.data)).toEqual(['2026-09-29', '2026-09-30']);
  });
});

describe('syncAll — não registra sucesso falso', () => {
  it('falha parcial: grava só os dias completos, põe ultimo_erro e NÃO mexe em ultima_sincronizacao', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    adapters.foxess = {
      fetchGeneration: vi.fn().mockResolvedValue({
        ok: true,
        geracoes: [{ data: '2026-09-29', geracao_kwh: 4 }],
        falhaParcial: '3 de 30 micros não responderam',
        statusInversor: 'ok',
      }),
    };
    const e = estado([sis('s1', 'foxess')], { s1: '2026-09-28' });
    const r = await new MonitoringService(fakeSupabase(e)).syncAll();
    expect(e.upserts.map((x) => x.data)).toEqual(['2026-09-29']);
    const ups = statusUpd(e, 's1');
    expect(ups.some((u) => u.fields.ultimo_erro === 'FoxESS: 3 de 30 micros não responderam')).toBe(true);
    expect(ups.some((u) => 'ultima_sincronizacao' in u.fields)).toBe(false);
    expect(r.sucessos).toBe(0);
    expect(r.falhas).toBe(1);
  });

  it('GoodWe sem nenhum dia na janela, com histórico → erro e sem "sincronizado agora"', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    adapters.goodwe = { fetchGeneration: vi.fn().mockResolvedValue({ ok: true, geracoes: [] }) };
    const e = estado([sis('g1', 'goodwe')], { g1: '2026-09-23' });
    const r = await new MonitoringService(fakeSupabase(e)).syncAll();
    const ups = statusUpd(e, 'g1');
    const erro = ups.find((u) => typeof u.fields.ultimo_erro === 'string')?.fields.ultimo_erro;
    expect(erro).toMatch(/^GoodWe: o portal não devolveu geração desde 23\/09/);
    expect(ups.some((u) => 'ultima_sincronizacao' in u.fields)).toBe(false);
    expect(r.falhas).toBe(1);
  });

  it('dias completos até hoje → sucesso limpa o erro e carimba a sincronização', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    adapters.deye = {
      fetchGeneration: vi.fn().mockResolvedValue({ ok: true, geracoes: [{ data: '2026-09-29', geracao_kwh: 9 }] }),
    };
    const e = estado([sis('s1', 'deye')], { s1: '2026-09-29' });
    const r = await new MonitoringService(fakeSupabase(e)).syncAll();
    const ok = statusUpd(e, 's1').find((u) => 'ultima_sincronizacao' in u.fields);
    expect(ok?.fields.ultimo_erro).toBeNull();
    expect(r.sucessos).toBe(1);
  });

  it('syncOne (botão da usina) segue a mesma regra: vazio com histórico = erro', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    adapters.nep = { fetchGeneration: vi.fn().mockResolvedValue({ ok: true, geracoes: [] }) };
    const e = estado([sis('n1', 'nep')], { n1: '2026-09-10' });
    const svc = new MonitoringService(fakeSupabase(e));
    const r = await svc.syncOne('n1');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/^NEP: o portal não devolveu geração desde 10\/09/);
    expect(statusUpd(e, 'n1').some((u) => 'ultima_sincronizacao' in u.fields)).toBe(false);
  });
});

describe('syncAll — trava de sobreposição', () => {
  it('segunda rodada chamada enquanto a primeira roda não chama nenhum adapter', async () => {
    let libera: () => void = () => {};
    const fetchGeneration = vi.fn().mockImplementation(() => new Promise((res) => {
      libera = () => res({ ok: true, geracoes: [] });
    }));
    adapters.deye = { fetchGeneration };
    const e = estado([sis('s1', 'deye')]);
    const svc = new MonitoringService(fakeSupabase(e));
    const p1 = svc.syncAll();
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await svc.syncAll();
    expect(r2.emAndamento).toBe(true);
    expect(fetchGeneration).toHaveBeenCalledTimes(1);
    libera();
    await p1;
    // terminou → a próxima rodada volta a rodar
    fetchGeneration.mockResolvedValue({ ok: true, geracoes: [] });
    await svc.syncAll();
    expect(fetchGeneration).toHaveBeenCalledTimes(2);
  });

  it('se a rodada lança exceção, a trava é liberada', async () => {
    adapters.deye = { fetchGeneration: vi.fn() };
    const e = estado([sis('s1', 'deye')]);
    const svc = new MonitoringService(fakeSupabase(e));
    (svc as any).listarSistemasAtivos = vi.fn().mockRejectedValueOnce(new Error('banco fora'));
    await expect(svc.syncAll()).rejects.toThrow('banco fora');
    (svc as any).listarSistemasAtivos = vi.fn().mockResolvedValue([]);
    const r = await svc.syncAll();
    expect(r.emAndamento).toBeFalsy();
  });
});

describe('syncAll — SolarEdge respeita o limite de 300 chamadas/dia', () => {
  it('SolarEdge no máximo 1×/hora por usina; as outras marcas seguem a cada rodada', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    const se = vi.fn().mockResolvedValue({ ok: true, geracoes: [{ data: '2026-09-29', geracao_kwh: 1 }] });
    const dy = vi.fn().mockResolvedValue({ ok: true, geracoes: [{ data: '2026-09-29', geracao_kwh: 1 }] });
    adapters.solaredge = { fetchGeneration: se };
    adapters.deye = { fetchGeneration: dy };
    const e = estado([sis('se1', 'solaredge'), sis('d1', 'deye')], { se1: '2026-09-29', d1: '2026-09-29' });
    const svc = new MonitoringService(fakeSupabase(e));
    await svc.syncAll();
    vi.setSystemTime(new Date('2026-09-29T15:15:00Z'));
    await svc.syncAll();
    vi.setSystemTime(new Date('2026-09-29T15:45:00Z'));
    await svc.syncAll();
    expect(se).toHaveBeenCalledTimes(1);
    expect(dy).toHaveBeenCalledTimes(3);
    vi.setSystemTime(new Date('2026-09-29T16:01:00Z'));
    await svc.syncAll();
    expect(se).toHaveBeenCalledTimes(2);
  });

  it('429 da SolarEdge pausa a CHAVE inteira por 3 h (não martela) e avisa em português', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    const se = vi.fn().mockResolvedValueOnce({ ok: false, reason: 'SolarEdge 429: Too Many Requests', status: 429 })
      .mockResolvedValue({ ok: true, geracoes: [{ data: '2026-09-29', geracao_kwh: 1 }] });
    adapters.solaredge = { fetchGeneration: se };
    const e = estado([sis('se1', 'solaredge'), sis('se2', 'solaredge')], { se1: '2026-09-29', se2: '2026-09-29' });
    const svc = new MonitoringService(fakeSupabase(e));
    await svc.syncAll();
    expect(se).toHaveBeenCalledTimes(1); // se2 (mesma chave) nem tenta
    const erro = statusUpd(e, 'se1').find((u) => typeof u.fields.ultimo_erro === 'string')?.fields.ultimo_erro;
    expect(erro).toMatch(/limite diário de consultas/);
    vi.setSystemTime(new Date('2026-09-29T17:00:00Z')); // 2 h depois: ainda pausada
    await svc.syncAll();
    expect(se).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-09-29T18:01:00Z')); // passou 3 h
    await svc.syncAll();
    expect(se).toHaveBeenCalledTimes(3);
  });
});

describe('descoberta de usinas — não estraga cadastro', () => {
  const site = {
    externalId: 'SITE-1', apelido: 'Casa', potencia_kwp: 3.3, cidade: null, uf: null,
    data_instalacao: null, credenciais: { site_id: 'SITE-1', api_key: 'KEY-A' },
  };

  it('usina com kWp preenchido e PAUSADA à mão: não troca kWp nem religa', async () => {
    adapters.solaredge = { listSites: vi.fn().mockResolvedValue({ ok: true, sites: [site] }) };
    const e = estado([]);
    e.existentePorSite = sis('x1', 'solaredge', { potencia_kwp: 8.2, ativo: false, ultimo_erro: 'algo' });
    await new MonitoringService(fakeSupabase(e)).importarSitesEmMassa('solaredge', { api_key: 'KEY-A' }, 'emp-1');
    const u = e.updates.find((x) => x.tabela === 'sistemas_clientes' && x.id === 'x1')!;
    expect(u).toBeTruthy();
    expect('potencia_kwp' in u.fields).toBe(false);
    expect('ativo' in u.fields).toBe(false);
    expect('ultimo_erro' in u.fields).toBe(false); // não apaga o aviso do sync
  });

  it('usina sem kWp (null/0): a descoberta preenche', async () => {
    adapters.solaredge = { listSites: vi.fn().mockResolvedValue({ ok: true, sites: [site] }) };
    const e = estado([]);
    e.existentePorSite = sis('x1', 'solaredge', { potencia_kwp: 0 });
    await new MonitoringService(fakeSupabase(e)).importarSitesEmMassa('solaredge', { api_key: 'KEY-A' }, 'emp-1');
    const u = e.updates.find((x) => x.tabela === 'sistemas_clientes' && x.id === 'x1')!;
    expect(u.fields.potencia_kwp).toBe(3.3);
  });

  it('SolarEdge: descoberta no máximo a cada 6 h (as outras marcas seguem 1×/h)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'));
    const seList = vi.fn().mockResolvedValue({ ok: true, sites: [] });
    const dyList = vi.fn().mockResolvedValue({ ok: true, sites: [] });
    adapters.solaredge = { listSites: seList, extractAccountCreds: (c: any) => ({ api_key: c.api_key }) };
    adapters.deye = { listSites: dyList, extractAccountCreds: (c: any) => ({ k: c.api_key }) };
    const e = estado([sis('se1', 'solaredge'), sis('d1', 'deye')]);
    const svc = new MonitoringService(fakeSupabase(e));
    await svc.descobrirNovosSites();
    vi.setSystemTime(new Date('2026-09-29T11:00:00Z'));
    await svc.descobrirNovosSites();
    expect(seList).toHaveBeenCalledTimes(1);
    expect(dyList).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-09-29T16:01:00Z'));
    await svc.descobrirNovosSites();
    expect(seList).toHaveBeenCalledTimes(2);
  });
});
