// tests/proactive-alerts-elo-evento.test.ts
// Elo: ao disparar um alerta de usina/inversor com sucesso, o dispatcher
// registra o evento 'operacao:alerta_usina' na espinha de eventos (best-effort).
import { describe, it, expect, vi } from 'vitest';
import { runDispatchCycle } from '../src/modules/monitoring/proactive-alerts/dispatcher.js';

// Sexta 2026-05-22 às 10h BRT = 13h UTC — dentro da janela de despacho.
const horaJanela = new Date('2026-05-22T13:00:00Z');

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
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  const ctx: any = {
    supabase: {
      getAlertasParaDespachar: vi.fn().mockResolvedValue([alerta()]),
      lockAlertaParaEnvio: vi.fn().mockResolvedValue(true),
      unlockAlerta: vi.fn().mockResolvedValue(undefined),
      marcarAlertaEnviado: vi.fn().mockResolvedValue(undefined),
      // usina órfã (lead_id null) -> vai direto pro alerta admin
      getSistemaById: vi.fn().mockResolvedValue({
        id: 'sid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye', lead_id: null,
      }),
      getLeadById: vi.fn().mockResolvedValue(null),
      getClient: vi.fn().mockReturnValue({ from }),
      ...overrides.supabase,
    },
    sendAdminWithButtons: vi.fn().mockResolvedValue(undefined),
    adminPhone: '5561987654321',
    dryRun: false,
    ...(({ supabase: _s, ...rest }) => rest)(overrides),
  };
  return { ctx, from, insert };
}

describe('runDispatchCycle -> Elo: registra operacao:alerta_usina', () => {
  it('alerta admin disparado com sucesso -> registra evento na espinha', async () => {
    const { ctx, from, insert } = fakeCtx();
    const r = await runDispatchCycle(horaJanela, ctx as any);

    expect(r.enviados).toBe(1);
    expect(ctx.sendAdminWithButtons).toHaveBeenCalledOnce();
    expect(ctx.supabase.getClient).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith('eventos_elo');
    expect(insert).toHaveBeenCalledOnce();

    const row = insert.mock.calls[0][0];
    expect(row.tipo).toBe('operacao:alerta_usina');
    expect(row.departamento).toBe('operacao');
    expect(row.canal).toBe('sistema');
    expect(row.origem).toBe('monitoramento');
    expect(row.payload.usinaId).toBe('sid-1');
    expect(row.payload.tipoAlerta).toBe('sistema_offline');
    expect(row.payload.marca).toBe('deye');
    expect(typeof row.payload.mensagem).toBe('string');
    expect(row.payload.mensagem.length).toBeGreaterThan(0);
  });

  it('envio falha (WABA) -> NÃO registra evento', async () => {
    const { ctx, insert } = fakeCtx({
      sendAdminWithButtons: vi.fn().mockRejectedValue(new Error('rate limit')),
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it('registrarEvento é best-effort: insert com erro NÃO derruba o envio', async () => {
    const insertErro = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const { ctx } = fakeCtx({
      supabase: { getClient: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertErro }) }) },
    });
    const r = await runDispatchCycle(horaJanela, ctx as any);
    expect(r.enviados).toBe(1); // alerta continua contabilizado como enviado
  });
});
