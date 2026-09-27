import { describe, it, expect, vi } from 'vitest';
import { prepararRelatorioPeriodo, type DepsServicoRelatorio } from '../src/modules/gd/relatorio-servico.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';

const HIST = [
  { mes: '2026-04-01', consumida: 470, injetada: 210, faturada: 0, compensado: 360, credito: 0 },
  { mes: '2026-05-01', consumida: 500, injetada: 200, faturada: 0, compensado: 380, credito: 0 },
  { mes: '2026-06-01', consumida: 490, injetada: 190, faturada: 0, compensado: 370, credito: 0 },
  { mes: '2026-07-01', consumida: 480, injetada: 222, faturada: 0, compensado: 360, credito: 0 },
];

const linha = (referencia: string, over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: `D-${referencia}`, lead_id: 'L1', cliente_nome: 'JOAO', codigo_cliente: '1', instalacao: '351534', referencia,
  injetado_kwh: 200, consumo_kwh: 480, credito_utilizado_kwh: 360, credito_restante_kwh: 0, saldo_acumulado_kwh: 1240,
  total_compensado_kwh: 99999, proximo_expirar_kwh: null, ciclo_expirar: null,
  historico: HIST, unidades: [], inconsistencias: [], origem: 'email', origem_verificada: true, recebido_em: '', conferido_em: null, ...over,
});

const LINHAS = [linha('2026-07-01'), linha('2026-06-01'), linha('2026-05-01')];

function deps(over: Partial<DepsServicoRelatorio> = {}): DepsServicoRelatorio {
  return {
    historicoDaInstalacao: vi.fn().mockResolvedValue(LINHAS),
    geracoesManuais: vi.fn().mockResolvedValue(new Map()),
    sistemaDoLead: vi.fn().mockResolvedValue({ potenciaKwp: 5, uf: 'DF' }),
    geracaoApiDoMes: vi.fn().mockImplementation(async (_l: string, ref: string) => ({
      '2026-04-01': 570, '2026-05-01': 600, '2026-06-01': 560, '2026-07-01': 590,
    } as Record<string, number>)[ref] ?? null),
    tarifaRsKwh: 1,
    ...over,
  };
}

describe('prepararRelatorioPeriodo', () => {
  it('todos os meses 🟢 → relatório do período com as somas e o cliente', async () => {
    const r = await prepararRelatorioPeriodo('351534', '2026-05-01', '2026-07-01', deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leadId).toBe('L1');
    expect(r.relatorio.periodoExtenso).toBe('maio a julho de 2026');
    expect(r.relatorio.totais.gerouKwh).toBe(1750);
    expect(r.relatorio.totais.compensadoKwh).toBe(1110);
    expect(r.relatorio.totais.economiaRs).toBe(1110);
    // gráfico: meses fora do período também têm a geração (API)
    expect(r.relatorio.grafico.map((m) => [m.mes, m.geracao, m.noPeriodo])).toEqual([
      ['2026-04-01', 570, false], ['2026-05-01', 600, true], ['2026-06-01', 560, true], ['2026-07-01', 590, true],
    ]);
  });

  it('geração digitada tem prioridade sobre a API no mês do período', async () => {
    const d = deps({
      geracoesManuais: vi.fn().mockResolvedValue(new Map([['351534|2026-06-01', { kwh: 565, origem: 'digitado', conferido_em: '' }]])),
    });
    const r = await prepararRelatorioPeriodo('351534', '2026-05-01', '2026-07-01', d);
    expect(r.ok && r.relatorio.meses[1].gerouKwh).toBe(565);
  });

  it('mês do período sem demonstrativo → 409 "falta em <mês>"', async () => {
    const r = await prepararRelatorioPeriodo('351534', '2026-04-01', '2026-07-01', deps());
    expect(r).toEqual({ ok: false, status: 409, motivo: 'falta em abril de 2026: não há demonstrativo desse mês' });
  });

  it('mês do período sem geração → 409 "falta em <mês>: <motivo>"', async () => {
    const api = vi.fn().mockImplementation(async (_l: string, ref: string) => (ref === '2026-06-01' ? null : 590));
    const r = await prepararRelatorioPeriodo('351534', '2026-05-01', '2026-07-01', deps({ geracaoApiDoMes: api }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.motivo).toMatch(/^falta em junho de 2026: falta a geração/);
  });

  it('mês com número que não bate → 409 "erro em <mês>: <motivo>" (mesma trava do mensal)', async () => {
    const ruim = linha('2026-06-01', { consumo_kwh: 100, historico: [{ mes: '2026-06-01', consumida: 100, injetada: 190, faturada: 0, compensado: 400, credito: 0 }] });
    const r = await prepararRelatorioPeriodo('351534', '2026-05-01', '2026-07-01', deps({
      historicoDaInstalacao: vi.fn().mockResolvedValue([linha('2026-07-01'), ruim, linha('2026-05-01')]),
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/^erro em junho de 2026: créditos compensados 400 kWh maior que o consumo/);
  });

  it('mês sem cliente → 409', async () => {
    const r = await prepararRelatorioPeriodo('351534', '2026-05-01', '2026-07-01', deps({
      historicoDaInstalacao: vi.fn().mockResolvedValue([linha('2026-07-01'), linha('2026-06-01', { lead_id: null }), linha('2026-05-01')]),
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/^falta em junho de 2026: UC sem cliente/);
  });

  it('mês ligado a OUTRO cliente → 409 (não mistura clientes num relatório)', async () => {
    const r = await prepararRelatorioPeriodo('351534', '2026-05-01', '2026-07-01', deps({
      historicoDaInstalacao: vi.fn().mockResolvedValue([linha('2026-07-01'), linha('2026-06-01'), linha('2026-05-01', { lead_id: 'L2' })]),
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/^erro em maio de 2026: .*outro cliente/);
  });

  it('período inválido → 400 sem ler o banco', async () => {
    const d = deps();
    const r = await prepararRelatorioPeriodo('351534', '2026-08-01', '2026-05-01', d);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(d.historicoDaInstalacao).not.toHaveBeenCalled();
    const r13 = await prepararRelatorioPeriodo('351534', '2025-07-01', '2026-07-01', d);
    expect(r13).toMatchObject({ ok: false, status: 400 });
  });

  it('busca kWp do cliente uma vez só e a geração de cada mês uma vez', async () => {
    const d = deps();
    await prepararRelatorioPeriodo('351534', '2026-05-01', '2026-07-01', d);
    expect(d.sistemaDoLead).toHaveBeenCalledTimes(1);
    const api = d.geracaoApiDoMes as ReturnType<typeof vi.fn>;
    for (const m of ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01']) {
      expect(api.mock.calls.filter((c) => c[1] === m)).toHaveLength(1);
    }
  });
});
