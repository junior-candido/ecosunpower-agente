// tests/proactive-alerts-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ProactiveAlertService } from '../src/modules/monitoring/proactive-alerts/service.js';

const hoje = new Date('2026-05-20T12:00:00Z');

function fakeSupabase(overrides: any = {}) {
  return {
    getAlertasAbertosBySistemas: vi.fn().mockResolvedValue([]),
    criarAlertaPendente: vi.fn().mockResolvedValue(undefined),
    resolverAlerta: vi.fn().mockResolvedValue(undefined),
    // [A3] runDetectionCycle busca o dono (company_id) dos sistemas com alerta novo
    getClient: () => ({
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({ data: [{ id: 'sid-1', company_id: '33333333-3333-4333-8333-333333333333' }], error: null }),
        }),
      }),
    }),
    ...overrides,
  };
}
function fakeMonitoringService(sistemas: any[]) {
  return {
    listarParaDashboard: vi.fn().mockResolvedValue(sistemas),
  };
}
function sistemaListado(o: any = {}) {
  return {
    id: 'sid-1', lead_id: 'lid-1', apelido: 'X', ativo: true,
    potencia_kwp: 5, uf: 'DF', ultimo_erro: null,
    geracao_7d_kwh: 5 * 5.2 * 0.80 * 7,
    diasSemGeracao: 0,
    ...o,
  };
}

describe('ProactiveAlertService.runDetectionCycle', () => {
  it('chama detect com input mapeado do listarParaDashboard', async () => {
    const sb = fakeSupabase();
    const ms = fakeMonitoringService([sistemaListado({ diasSemGeracao: 5, geracao_7d_kwh: 0 })]);
    const svc = new ProactiveAlertService(sb as any, ms as any);
    const r = await svc.runDetectionCycle(hoje);
    expect(r.novos).toBe(1);
    expect(sb.criarAlertaPendente).toHaveBeenCalledOnce();
    const callArg = sb.criarAlertaPendente.mock.calls[0][0];
    expect(callArg.sistema_id).toBe('sid-1');
    expect(callArg.tipo).toBe('sistema_offline');
    expect(callArg.next_send_at).toBe(hoje.toISOString());
    // [A3] alerta nasce carimbado com a empresa dona do sistema
    expect(callArg.company_id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('resolve alertas abertos quando condição desaparece', async () => {
    const aberto = {
      id: 'aid-1', sistema_id: 'sid-1', tipo: 'queda_geracao', severidade: 'aviso',
      next_send_at: '2026-05-25T00:00:00Z', snoozed_until: null, resolved_at: null,
    };
    const sb = fakeSupabase({
      getAlertasAbertosBySistemas: vi.fn().mockResolvedValue([aberto]),
    });
    const ms = fakeMonitoringService([sistemaListado()]); // OK now
    const svc = new ProactiveAlertService(sb as any, ms as any);
    const r = await svc.runDetectionCycle(hoje);
    expect(r.resolvidos).toBe(1);
    expect(sb.resolverAlerta).toHaveBeenCalledWith('aid-1', hoje.toISOString(), 'auto');
  });

  // Régua relativa (29/07): o ciclo agrupa POR EMPRESA e calcula a mediana
  // de kWh/kWp de cada carteira. Julho nublado no RJ derrubou a carteira
  // INTEIRA do tenant → usina saudável não pode virar alerta no zap.
  it('régua relativa por empresa: carteira grande protege usina na mediana; carteira pequena segue HSP', async () => {
    const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    // Empresa A: 6 usinas de 5 kWp gerando 60 kWh/7d (41% do esperado HSP —
    // a régua antiga acusaria TODAS; a mediana da carteira diz que é o clima).
    const frotaA = Array.from({ length: 6 }, (_, i) => sistemaListado({
      id: `a${i}`, lead_id: `la${i}`, company_id: A, geracao_7d_kwh: 60,
    }));
    // Empresa B: 1 usina idêntica, carteira pequena → sem mediana → HSP acusa.
    const frotaB = [sistemaListado({ id: 'b1', lead_id: 'lb1', company_id: B, geracao_7d_kwh: 60 })];
    const sb = fakeSupabase();
    const ms = fakeMonitoringService([...frotaA, ...frotaB]);
    const svc = new ProactiveAlertService(sb as any, ms as any);
    const r = await svc.runDetectionCycle(hoje);
    expect(r.novos).toBe(1);
    const calls = sb.criarAlertaPendente.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toHaveLength(1);
    expect(calls[0].sistema_id).toBe('b1');
    expect(calls[0].tipo).toBe('queda_geracao');
  });

  it('lista vazia -> nada acontece', async () => {
    const sb = fakeSupabase();
    const ms = fakeMonitoringService([]);
    const svc = new ProactiveAlertService(sb as any, ms as any);
    const r = await svc.runDetectionCycle(hoje);
    expect(r.novos).toBe(0);
    expect(r.resolvidos).toBe(0);
    expect(sb.criarAlertaPendente).not.toHaveBeenCalled();
  });
});
