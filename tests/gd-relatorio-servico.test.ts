import { describe, it, expect, vi } from 'vitest';
import { prepararRelatorio, type DepsServicoRelatorio } from '../src/modules/gd/relatorio-servico.js';
import type { LinhaDemonstrativo } from '../src/modules/gd/demonstrativos-tela-repo.js';

const linha = (over: Partial<LinhaDemonstrativo> = {}): LinhaDemonstrativo => ({
  id: 'D1', lead_id: 'L1', cliente_nome: 'JOAO', codigo_cliente: '1', instalacao: '351534', referencia: '2026-08-01',
  injetado_kwh: 222, consumo_kwh: 480, credito_utilizado_kwh: 380, credito_restante_kwh: 0, saldo_acumulado_kwh: 1240, total_compensado_kwh: null,
  proximo_expirar_kwh: null, ciclo_expirar: null,
  historico: [
    { mes: '2026-07-01', consumida: 500, injetada: 200, faturada: 0, compensado: 380, credito: 0 },
    { mes: '2026-08-01', consumida: 480, injetada: 222, faturada: 0, compensado: 380, credito: 0 },
  ],
  unidades: [], inconsistencias: [], origem: 'email', origem_verificada: true, recebido_em: '', conferido_em: null, ...over,
});

function deps(over: Partial<DepsServicoRelatorio> = {}): DepsServicoRelatorio {
  return {
    historicoDaInstalacao: vi.fn().mockResolvedValue([linha()]),
    geracoesManuais: vi.fn().mockResolvedValue(new Map()),
    sistemaDoLead: vi.fn().mockResolvedValue({ potenciaKwp: 5, uf: 'DF' }),
    geracaoApiDoMes: vi.fn().mockImplementation(async (_l: string, ref: string) => (ref === '2026-08-01' ? 600 : 580)),
    tarifaRsKwh: 0.99,
    ...over,
  };
}

describe('prepararRelatorio', () => {
  it('mes pronto monta o relatorio com a geracao da API e a dos meses anteriores', async () => {
    const r = await prepararRelatorio('351534', '2026-08-01', deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.relatorio.gerouKwh).toBe(600);
    expect(r.relatorio.meses.map((m) => m.geracao)).toEqual([580, 600]);
    expect(r.relatorio.economiaRs).toBe(376.2);
  });
  it('geracao digitada tem prioridade sobre a API no grafico e no mes', async () => {
    const d = deps({
      geracoesManuais: vi.fn().mockResolvedValue(new Map([['351534|2026-08-01', { kwh: 610, origem: 'digitado', conferido_em: '' }]])),
    });
    const r = await prepararRelatorio('351534', '2026-08-01', d);
    expect(r.ok && r.relatorio.gerouKwh).toBe(610);
    expect(r.ok && r.relatorio.meses[1].geracao).toBe(610);
  });
  it('mes que nao existe → 404', async () => {
    const r = await prepararRelatorio('351534', '2026-05-01', deps());
    expect(r).toEqual({ ok: false, status: 404, motivo: 'não há demonstrativo desse mês para essa UC' });
  });
  it('mes que nao esta 🟢 → 409 com o motivo (so gera com tudo verde)', async () => {
    const r = await prepararRelatorio('351534', '2026-08-01', deps({ geracaoApiDoMes: vi.fn().mockResolvedValue(null) }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.motivo).toMatch(/falta a geração/);
  });
  it('UC sem cliente → 409', async () => {
    const r = await prepararRelatorio('351534', '2026-08-01', deps({ historicoDaInstalacao: vi.fn().mockResolvedValue([linha({ lead_id: null })]) }));
    expect(r.ok).toBe(false);
  });
  it('rateio: busca a geracao de cada mes uma vez so (meses distintos)', async () => {
    const historico = [
      { mes: '2026-07-01', codigoCliente: 'A', consumida: 300, injetada: 200, faturada: 0, compensado: 200, credito: 0 },
      { mes: '2026-07-01', codigoCliente: 'B', consumida: 200, injetada: 0, faturada: 0, compensado: 180, credito: 0 },
      { mes: '2026-08-01', codigoCliente: 'A', consumida: 300, injetada: 222, faturada: 0, compensado: 200, credito: 0 },
      { mes: '2026-08-01', codigoCliente: 'B', consumida: 180, injetada: 0, faturada: 0, compensado: 150, credito: 0 },
    ];
    const api = vi.fn().mockImplementation(async (_l: string, ref: string) => (ref === '2026-08-01' ? 600 : 580));
    const r = await prepararRelatorio('351534', '2026-08-01', deps({
      historicoDaInstalacao: vi.fn().mockResolvedValue([linha({ historico })]), geracaoApiDoMes: api,
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.relatorio.meses.map((m) => m.mes)).toEqual(['2026-07-01', '2026-08-01']);
    expect(r.relatorio.meses.map((m) => m.geracao)).toEqual([580, 600]);
    expect(api.mock.calls.filter((c) => c[1] === '2026-07-01')).toHaveLength(1);
  });
});

describe('prepararRelatorio — trava compensado x consumo', () => {
  it('compensado do mes maior que o consumo → 409, relatorio nao sai', async () => {
    const hist = [{ mes: '2026-08-01', consumida: 100, injetada: 222, faturada: 0, compensado: 400, credito: 0 }];
    const r = await prepararRelatorio('351534', '2026-08-01', deps({
      historicoDaInstalacao: vi.fn().mockResolvedValue([linha({ consumo_kwh: 100, historico: hist })]),
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.motivo).toMatch(/maior que o consumo/);
  });
});

describe('prepararRelatorio — cliente do relatório', () => {
  it('mês pronto devolve o lead (o envio ao cliente precisa dele)', async () => {
    const r = await prepararRelatorio('351534', '2026-08-01', deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leadId).toBe('L1');
  });
});
