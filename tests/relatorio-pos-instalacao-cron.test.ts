// tests/relatorio-pos-instalacao-cron.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runPosInstalacaoNotifCycle } from '../src/modules/relatorios/pos-instalacao/cron.js';

const horaJanela = new Date('2026-05-22T13:00:00Z');  // sex 10h BRT — dentro
const horaForaJanela = new Date('2026-05-17T13:00:00Z'); // domingo — fora

function fakeCtx(o: any = {}) {
  return {
    supabase: {
      getLeadsMedidorTrocadoSemRelatorio: vi.fn().mockResolvedValue([]),
      ...o.supabase,
    },
    sendText: vi.fn().mockResolvedValue(undefined),
    adminPhone: '5561987654321',
    dashboardBaseUrl: 'https://dashboard.ecosunpower.eng.br',
    ...o,
  };
}

describe('runPosInstalacaoNotifCycle', () => {
  it('fora da janela horária: não notifica', async () => {
    const ctx = fakeCtx({
      supabase: {
        getLeadsMedidorTrocadoSemRelatorio: vi.fn().mockResolvedValue([
          { id: 'lead-1', name: 'João', phone: '5561...', installation_status: 'medidor_trocado' },
        ]),
      },
    });
    const r = await runPosInstalacaoNotifCycle(horaForaJanela, ctx as any);
    expect(r.notificados).toBe(0);
    expect(ctx.sendText).not.toHaveBeenCalled();
  });

  it('lista vazia: 0 notificações', async () => {
    const ctx = fakeCtx();
    const r = await runPosInstalacaoNotifCycle(horaJanela, ctx as any);
    expect(r.notificados).toBe(0);
  });

  it('lead com medidor_trocado sem relatório: notifica Junior', async () => {
    const ctx = fakeCtx({
      supabase: {
        getLeadsMedidorTrocadoSemRelatorio: vi.fn().mockResolvedValue([
          { id: 'lead-1', name: 'João Silva', phone: '5561111', installation_status: 'medidor_trocado' },
          { id: 'lead-2', name: 'Maria', phone: '5561222', installation_status: 'medidor_trocado' },
        ]),
      },
    });
    const r = await runPosInstalacaoNotifCycle(horaJanela, ctx as any);
    expect(r.notificados).toBe(2);
    expect(ctx.sendText).toHaveBeenCalledTimes(2);
    const [phone1, body1] = ctx.sendText.mock.calls[0];
    expect(phone1).toBe('5561987654321');  // admin phone
    expect(body1).toContain('João Silva');
    expect(body1).toContain('medidor trocado');
    expect(body1).toMatch(/dashboard\.ecosunpower\.eng\.br\/dashboard\/clientes\/lead-1\/relatorio-pos-instalacao\/novo/);
  });

  it('lead sem nome: usa apelido genérico', async () => {
    const ctx = fakeCtx({
      supabase: {
        getLeadsMedidorTrocadoSemRelatorio: vi.fn().mockResolvedValue([
          { id: 'lead-1', name: null, phone: '5561111', installation_status: 'medidor_trocado' },
        ]),
      },
    });
    const r = await runPosInstalacaoNotifCycle(horaJanela, ctx as any);
    expect(r.notificados).toBe(1);
    const [, body] = ctx.sendText.mock.calls[0];
    expect(body).toContain('Cliente');  // fallback
  });

  it('falha ao enviar pra 1 lead: segue notificando os outros', async () => {
    const ctx = fakeCtx({
      supabase: {
        getLeadsMedidorTrocadoSemRelatorio: vi.fn().mockResolvedValue([
          { id: 'lead-1', name: 'A', phone: '1', installation_status: 'medidor_trocado' },
          { id: 'lead-2', name: 'B', phone: '2', installation_status: 'medidor_trocado' },
        ]),
      },
      sendText: vi.fn()
        .mockRejectedValueOnce(new Error('rate limit'))
        .mockResolvedValueOnce(undefined),
    });
    const r = await runPosInstalacaoNotifCycle(horaJanela, ctx as any);
    expect(r.notificados).toBe(1);  // só o 2º
    expect(r.falhas).toBe(1);
  });
});
