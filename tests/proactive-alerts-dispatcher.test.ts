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
    const [, sentAtQ, nextSendAtQ] = ctx.supabase.marcarAlertaAbsorvidoPorResumo.mock.calls[0];
    expect(new Date(nextSendAtQ).getTime() - new Date(sentAtQ).getTime()).toBe(3 * 24 * 60 * 60 * 1000);
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
    const [, sentAt, nextSendAt] = ctx.supabase.marcarAlertaAbsorvidoPorResumo.mock.calls[0];
    expect(new Date(nextSendAt).getTime() - new Date(sentAt).getTime()).toBe(30 * 24 * 60 * 60 * 1000);
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

// 30/09/2026 — alerta é da EMPRESA dona da usina (caso Conquista Solar).
// O cron roda sem empresa no contexto: sem isto, TODO alerta (de qualquer
// empresa) saía pro zap do dono da EcoSun, pelo WhatsApp oficial da EcoSun.
describe('runDispatchCycle — por empresa', () => {
  const TENANT = '11111111-1111-1111-1111-111111111111';
  const CASA = '00000000-0000-0000-0000-000000000001';
  const ehCasa = (cid: string | null | undefined) => !cid || cid === CASA;
  const sistemaTenant = {
    id: 'sid-1', apelido: 'Usina BA', potencia_kwp: 8, marca_inversor: 'sungrow',
    lead_id: 'lid-1', etapa_obra: 'pos_venda', company_id: TENANT,
  };

  it('tenant: aviso vai pela rota segura DA EMPRESA, sem botões, sem abordagem e sem resumo da casa', async () => {
    const proporAbordagem = vi.fn().mockResolvedValue('enviada');
    const autonomiaOn = vi.fn().mockResolvedValue(false);
    const avisoAdminDaEmpresa = vi.fn(async (_cid: string | null | undefined, enviar: (d: string) => Promise<void>) => {
      await enviar('5577988887777');
      return 'enviado';
    });
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta({ tipo: 'queda_geracao' })]),
        getSistemaById: vi.fn().mockResolvedValue(sistemaTenant),
      },
      ehCasa, avisoAdminDaEmpresa, proporAbordagem, autonomiaOn,
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(1);
    expect(avisoAdminDaEmpresa).toHaveBeenCalledWith(TENANT, expect.any(Function));
    expect(ctx.sendAdminWithButtons).toHaveBeenCalledOnce();
    const [destino, , botoes] = ctx.sendAdminWithButtons.mock.calls[0];
    expect(destino).toBe('5577988887777');
    expect(destino).not.toBe(ctx.adminPhone);
    expect(botoes).toEqual([]);
    expect(proporAbordagem).not.toHaveBeenCalled();
    expect(autonomiaOn).not.toHaveBeenCalled();
    expect(ctx.supabase.marcarAlertaAbsorvidoPorResumo).not.toHaveBeenCalled();
  });

  it('tenant bloqueado (sem canal/admin/pausado): não manda nada e fica no painel com trava de 3 dias', async () => {
    const avisoAdminDaEmpresa = vi.fn().mockResolvedValue('sem_canal_proprio');
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]),
        getSistemaById: vi.fn().mockResolvedValue(sistemaTenant),
      },
      ehCasa, avisoAdminDaEmpresa,
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
    expect(r.enviados).toBe(0);
    expect(r.soNoPainel).toBe(1);
    // Ninguém recebeu: NÃO marca como enviado (o painel contaria), só reagenda +3d.
    expect(ctx.supabase.marcarAlertaEnviado).not.toHaveBeenCalled();
    const [id, proxima] = ctx.supabase.unlockAlerta.mock.calls[0];
    expect(id).toBe('aid-1');
    expect(new Date(proxima).getTime() - horaJanela.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it('tenant sem a rota ligada: falha fechada (nunca o adminPhone da casa)', async () => {
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]),
        getSistemaById: vi.fn().mockResolvedValue(sistemaTenant),
      },
      ehCasa,
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.sendAdminWithButtons).not.toHaveBeenCalled();
    expect(r.soNoPainel).toBe(1);
  });

  it('erro na rota do tenant destrava o alerta (volta pra fila)', async () => {
    const avisoAdminDaEmpresa = vi.fn().mockRejectedValue(new Error('falhou'));
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]),
        getSistemaById: vi.fn().mockResolvedValue(sistemaTenant),
      },
      ehCasa, avisoAdminDaEmpresa,
    });
    await runDispatchCycle(horaJanela, ctx as any);
    expect(ctx.supabase.unlockAlerta).toHaveBeenCalledWith('aid-1', '2026-05-22T12:00:00Z');
  });

  it('usina da casa (company_id null, legado) com os ganchos ligados: fluxo de sempre, com abordagem', async () => {
    const proporAbordagem = vi.fn().mockResolvedValue('inelegivel');
    const avisoAdminDaEmpresa = vi.fn();
    const ctx = fakeCtx({
      supabase: {
        getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]),
        getSistemaById: vi.fn().mockResolvedValue({ ...sistemaTenant, company_id: null }),
      },
      ehCasa, avisoAdminDaEmpresa, proporAbordagem,
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(proporAbordagem).toHaveBeenCalledOnce();
    expect(avisoAdminDaEmpresa).not.toHaveBeenCalled();
    expect(r.enviados).toBe(1);
    expect(ctx.sendAdminWithButtons.mock.calls[0][0]).toBe('5561987654321');
  });

  it('sem os ganchos (compat): continua mandando pro adminPhone de sempre', async () => {
    const ctx = fakeCtx({ supabase: { getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]) } });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(1);
    expect(ctx.sendAdminWithButtons.mock.calls[0][0]).toBe('5561987654321');
  });
});
