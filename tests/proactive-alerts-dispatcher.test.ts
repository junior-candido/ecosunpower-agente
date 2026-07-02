// tests/proactive-alerts-dispatcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runDispatchCycle } from '../src/modules/monitoring/proactive-alerts/dispatcher.js';

// Sexta 2026-05-22 às 10h BRT = 13h UTC — dentro da janela.
const horaJanela = new Date('2026-05-22T13:00:00Z');
// Domingo 2026-05-17 mesma hora — fora.
const horaForaJanela = new Date('2026-05-17T13:00:00Z');

function alerta(o: any = {}) {
  return {
    id: 'aid-1', sistema_id: 'sid-1', tipo: 'sistema_offline', severidade: 'urgente',
    texto: 'Sem geração há 5 dias.', next_send_at: '2026-05-22T12:00:00Z',
    primeiro_visto_em: '2026-05-15T00:00:00Z', snoozed_until: null, resolved_at: null,
    last_sent_at: null, acao_disparada: null, acao_disparada_em: null,
    resolved_reason: null, created_at: '2026-05-15T00:00:00Z', ...o,
  };
}

function fakeCtx(overrides: any = {}) {
  return {
    supabase: {
      getAlertasParaDespachar: vi.fn().mockResolvedValue([]),
      lockAlertaParaEnvio: vi.fn().mockResolvedValue(true),
      unlockAlerta: vi.fn().mockResolvedValue(undefined),
      marcarAlertaEnviado: vi.fn().mockResolvedValue(undefined),
      getSistemaById: vi.fn().mockResolvedValue({
        id: 'sid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye', lead_id: 'lid-1',
        etapa_obra: 'pos_venda',
      }),
      getLeadById: vi.fn().mockResolvedValue({ id: 'lid-1', name: 'João', phone: '5561...' }),
      marcarAlertaAbsorvidoPorResumo: vi.fn().mockResolvedValue(undefined),
      ...overrides.supabase,
    },
    sendAdminWithButtons: vi.fn().mockResolvedValue(undefined),
    adminPhone: '5561987654321',
    dryRun: false,
    ...(({ supabase: _s, ...rest }) => rest)(overrides),
  };
}

describe('runDispatchCycle', () => {
  it('fora da janela: não faz nada', async () => {
    const ctx = fakeCtx({ supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) } });
    const r = await runDispatchCycle(horaForaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
  });

  it('fila vazia dentro da janela: 0 enviados', async () => {
    const ctx = fakeCtx();
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
  });

  it('lock falha -> pula sem enviar', async () => {
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]),
        lockAlertaParaEnvio: vi.fn().mockResolvedValue(false),
      },
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
  });

  it('sucesso: envia, marca last_sent_at + next_send_at = +3d', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) },
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(1);
    expect(ctx.sendAdminWithButtons).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaEnviado).toHaveBeenCalledOnce();
    const [, sentAt, nextSendAt] = ctx.supabase.marcarAlertaEnviado.mock.calls[0];
    const dt = new Date(nextSendAt).getTime() - new Date(sentAt).getTime();
    expect(dt).toBe(3 * 24 * 60 * 60 * 1000); // 3 dias
  });

  it('WABA falha: unlock e last_sent_at não muda', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) },
      sendAdminWithButtons: vi.fn().mockRejectedValue(new Error('rate limit')),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(ctx.supabase.marcarAlertaEnviado).not.toHaveBeenCalled();
    expect(ctx.supabase.unlockAlerta).toHaveBeenCalledOnce();
  });

  it('dry-run: não envia mas marca last_sent_at pra simular ciclo', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) },
      dryRun: true,
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(r.dryRunSimulados).toBe(1);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
  });

  it('queda com dono + autonomia OFF: absorvida pelo resumo, nada individual', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao', severidade: 'aviso' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      proporAbordagem: vi.fn(),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
    expect(ctx.proporAbordagem).not.toHaveBeenCalled();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).toHaveBeenCalledOnce();
    expect(r.enviados).toBe(0);
  });

  it('milestone com dono + autonomia OFF: absorvida (boa noticia vai no resumo)', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'milestone_economia', severidade: 'info' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      proporAbordagem: vi.fn(),
    });
    await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).not.toHaveBeenCalled();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).toHaveBeenCalledOnce();
  });

  it('queda com autonomia ON: segue pro proporAbordagem (igual hoje)', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(true),
      proporAbordagem: vi.fn().mockResolvedValue('enviada'),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
    expect(r.enviados).toBe(1);
  });

  it('offline ignora autonomiaOn: urgente continua individual', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'sistema_offline' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      proporAbordagem: vi.fn().mockResolvedValue('proposta'),
    });
    await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
  });

  it('sem autonomiaOn no ctx (compat): tudo igual hoje', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]) },
      proporAbordagem: vi.fn().mockResolvedValue('proposta'),
    });
    await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).toHaveBeenCalledOnce();
  });

  it('queda absorvida em dry-run: nao marca, so simula', async () => {
    const ctx = fakeCtx({
      supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]) },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      dryRun: true,
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
    expect(r.dryRunSimulados).toBe(1);
  });

  it('queda com dono + autonomia OFF mas usina em obra: NÃO absorve, segue pro proporAbordagem', async () => {
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao', severidade: 'aviso' })]),
        getSistemaById: vi.fn().mockResolvedValue({
          id: 'sid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye', lead_id: 'lid-1',
          etapa_obra: 'operacao',
        }),
      },
      autonomiaOn: vi.fn().mockResolvedValue(false),
      proporAbordagem: vi.fn().mockResolvedValue('proposta'),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.proporAbordagem).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
    expect(r.enviados).toBe(1);
  });

  it('queda SEM dono (orfa): alerta individual continua (cadastrar dono)', async () => {
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]),
        getSistemaById: vi.fn().mockResolvedValue({
          id: 'sid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye', lead_id: null,
        }),
      },
      autonomiaOn: vi.fn().mockResolvedValue(false),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.sendAdminWithButtons).toHaveBeenCalledOnce();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
    expect(r.enviados).toBe(1);
  });
});
