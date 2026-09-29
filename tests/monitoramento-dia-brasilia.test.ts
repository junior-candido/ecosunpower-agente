// tests/monitoramento-dia-brasilia.test.ts
// O servidor roda em UTC. Das 21h às 24h de Brasília o "hoje" em UTC já é
// AMANHÃ — a tela mostrava o dia seguinte vazio, o mês zerava no último dia
// às 21h e o sync pedia (e gravava 0 kWh em) um dia que ainda não existe.
// Regra: o monitoramento inteiro usa o calendário de BRASÍLIA.
import { describe, it, expect } from 'vitest';
import {
  hojeBrasilia, somarDias, inicioMesBrasilia, dataCurtaBr, janelaSync, limitarAoHoje,
} from '../src/modules/monitoring/util/dia-brasilia.js';

// 30/09/2026 21:00 em Brasília = 01/10/2026 00:00 UTC
const AS_21H_FIM_DO_MES = new Date('2026-10-01T00:00:00Z');
// 30/09/2026 23:59 em Brasília = 01/10/2026 02:59 UTC
const AS_23H59_FIM_DO_MES = new Date('2026-10-01T02:59:00Z');

describe('calendário de Brasília (monitoramento)', () => {
  it('às 21h e às 23h59 do último dia do mês, hoje ainda é 30/09', () => {
    expect(hojeBrasilia(AS_21H_FIM_DO_MES)).toBe('2026-09-30');
    expect(hojeBrasilia(AS_23H59_FIM_DO_MES)).toBe('2026-09-30');
    expect(inicioMesBrasilia(AS_23H59_FIM_DO_MES)).toBe('2026-09-01');
  });

  it('meia-noite de Brasília já vira o dia', () => {
    expect(hojeBrasilia(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10-01');
  });

  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('dataCurtaBr = DD/MM', () => {
    expect(dataCurtaBr('2026-09-23')).toBe('23/09');
  });

  it('janela do sync termina no hoje de Brasília (nunca pede amanhã)', () => {
    expect(janelaSync(AS_23H59_FIM_DO_MES, 7)).toEqual({ dataInicio: '2026-09-23', dataFim: '2026-09-30' });
  });

  it('limitarAoHoje descarta dias depois do hoje de Brasília', () => {
    const r = limitarAoHoje([
      { data: '2026-09-29', geracao_kwh: 10 },
      { data: '2026-09-30', geracao_kwh: 8 },
      { data: '2026-10-01', geracao_kwh: 0 },
    ], '2026-09-30');
    expect(r.map((g) => g.data)).toEqual(['2026-09-29', '2026-09-30']);
  });
});

// --- telas: lista e detalhe também no calendário de Brasília -----------------
import { vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { MonitoringService } from '../src/modules/monitoring/service.js';

function fakeDb(sistemas: any[], geracoes: any[]) {
  return {
    getClient() {
      return {
        from(tabela: string) {
          const q: any = {
            select() { return q; }, eq() { return q; }, in() { return q; }, gte() { return q; },
            order() { return q; }, range() { return q; },
            maybeSingle() { return Promise.resolve({ data: sistemas[0], error: null }); },
            then(res: any) { return res({ data: tabela === 'sistemas_clientes' ? sistemas : geracoes, error: null }); },
          };
          return q;
        },
      };
    },
  } as any;
}

describe('telas do monitoramento às 23h59 do último dia do mês (Brasília)', () => {
  afterEach(() => vi.useRealTimers());
  const sistema = { id: 's1', apelido: 'A', marca_inversor: 'deye', ativo: true, potencia_kwp: 5, uf: 'DF', company_id: null };
  const ger = [
    { sistema_id: 's1', data: '2026-09-10', geracao_kwh: 20 },
    { sistema_id: 's1', data: '2026-09-30', geracao_kwh: 8 },
  ];

  it('lista: hoje = 30/09 e o mês NÃO zera', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AS_23H59_FIM_DO_MES);
    const rows = await new MonitoringService(fakeDb([sistema], ger)).listarParaDashboard();
    expect(rows[0].geracao_hoje_kwh).toBe(8);
    expect(rows[0].geracao_mes_kwh).toBe(28);
  });

  it('detalhe: KPI de hoje/mês certos e a seta "próximo" não abre 01/10', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AS_23H59_FIM_DO_MES);
    const svc = new MonitoringService(fakeDb([sistema], ger));
    (svc as any).medianaDaCarteira7d = async () => null;
    const d = await svc.getDetalheCalendario('s1', { vista: 'dia', ref: '2026-09-30' });
    expect(d!.kpis.hojeKwh).toBe(8);
    expect(d!.kpis.mesKwh).toBe(28);
    expect(d!.nav.proximo).toBeNull();
  });

  it('rota do detalhe usa o hoje de Brasília como dia padrão', () => {
    const src = readFileSync('src/modules/dashboard/router.ts', 'utf8');
    const trecho = src.slice(src.indexOf("router.get('/monitoramento/:id'"), src.indexOf("router.get('/monitoramento/:id'") + 900);
    expect(trecho).toMatch(/hojeBrasilia\(\)/);
    expect(trecho).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });
});
