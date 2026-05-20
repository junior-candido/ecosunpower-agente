// tests/eva-admin-buttons.test.ts
import { describe, it, expect, vi } from 'vitest';
import { tryHandleEvaAdminButton } from '../src/modules/eva-admin-buttons.js';

function ctx(overrides: any = {}) {
  const client: any = {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
  return {
    client,
    sendText: vi.fn().mockResolvedValue(undefined),
    from: '5561987654321',
    forceCadenceForSilentes: vi.fn().mockResolvedValue({ acionados: 0 }),
    supabase: {
      getSistemaById: vi.fn().mockResolvedValue({
        id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye',
      }),
      getLeadById: vi.fn().mockResolvedValue({ id: 'lid-1', name: 'João', phone: '5561999990000', opt_out: false }),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
      marcarAlertaAcaoDisparada: vi.fn().mockResolvedValue(undefined),
      snoozeAlerta: vi.fn().mockResolvedValue(undefined),
      resolverAlertaManual: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe('tryHandleEvaAdminButton — alert-* family', () => {
  it('alert-eva-limpeza: cria maintenance_reminder + marca ação', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:alert-eva-limpeza:00000000-0000-0000-0000-000000000001',
    } as any);
    expect(handled).toBe(true);
    expect(c.supabase.upsertMaintenanceReminderPublic).toHaveBeenCalledOnce();
    const arg = c.supabase.upsertMaintenanceReminderPublic.mock.calls[0][0];
    expect(arg.topic).toBe('alerta_limpeza');
    expect(arg.lead_id).toBe('lid-1');
    expect(c.supabase.marcarAlertaAcaoDisparada).toHaveBeenCalledOnce();
    expect(c.sendText).toHaveBeenCalled();
  });

  it('alert-eva-offline: topic alerta_offline', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-eva-offline:00000000-0000-0000-0000-000000000001' } as any);
    const arg = c.supabase.upsertMaintenanceReminderPublic.mock.calls[0][0];
    expect(arg.topic).toBe('alerta_offline');
  });

  it('alert-eva-depoimento: topic pedido_depoimento', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-eva-depoimento:00000000-0000-0000-0000-000000000001' } as any);
    const arg = c.supabase.upsertMaintenanceReminderPublic.mock.calls[0][0];
    expect(arg.topic).toBe('pedido_depoimento');
  });

  it('alert-eva-limpeza com lead em opt_out: avisa, NÃO cria reminder', async () => {
    const c = ctx({
      supabase: {
        getSistemaById: vi.fn().mockResolvedValue({ id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye' }),
        getLeadById: vi.fn().mockResolvedValue({ id: 'lid-1', name: 'João', phone: '...', opt_out: true }),
        upsertMaintenanceReminderPublic: vi.fn(),
        marcarAlertaAcaoDisparada: vi.fn(),
        snoozeAlerta: vi.fn(),
        resolverAlertaManual: vi.fn(),
      },
    });
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-eva-limpeza:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.upsertMaintenanceReminderPublic).not.toHaveBeenCalled();
    expect(c.sendText.mock.calls[0][1]).toMatch(/opt-?out/i);
  });

  it('alert-eva-* com sistema sem lead_id: pede vincular', async () => {
    const c = ctx({
      supabase: {
        getSistemaById: vi.fn().mockResolvedValue({ id: 'sid-1', lead_id: null, apelido: 'Casa', potencia_kwp: 5, marca_inversor: 'deye' }),
        getLeadById: vi.fn(),
        upsertMaintenanceReminderPublic: vi.fn(),
        marcarAlertaAcaoDisparada: vi.fn(),
        snoozeAlerta: vi.fn(),
        resolverAlertaManual: vi.fn(),
      },
    });
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-eva-limpeza:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.upsertMaintenanceReminderPublic).not.toHaveBeenCalled();
    expect(c.sendText.mock.calls[0][1]).toMatch(/vincul/i);
  });

  it('alert-ligar: responde com wa.me + nome', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-ligar:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.sendText.mock.calls[0][1]).toContain('wa.me/5561999990000');
    expect(c.sendText.mock.calls[0][1]).toContain('João');
  });

  it('alert-snooze3d: chama snoozeAlerta com +3d', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-snooze3d:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.snoozeAlerta).toHaveBeenCalledOnce();
    const [, until] = c.supabase.snoozeAlerta.mock.calls[0];
    const diff = new Date(until).getTime() - Date.now();
    expect(diff).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(3.1 * 24 * 60 * 60 * 1000);
  });

  it('alert-snooze7d: +7d', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-snooze7d:00000000-0000-0000-0000-000000000001' } as any);
    const [, until] = c.supabase.snoozeAlerta.mock.calls[0];
    const diff = new Date(until).getTime() - Date.now();
    expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });

  it('alert-resolvido: chama resolverAlertaManual com manual', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-resolvido:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.resolverAlertaManual).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'manual',
    );
  });

  it('alert-ignorar: chama resolverAlertaManual com ignorada', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-ignorar:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.supabase.resolverAlertaManual).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'ignorada',
    );
  });

  it('alert-ver: responde com URL dashboard', async () => {
    const c = ctx();
    await tryHandleEvaAdminButton({ ...c, text: 'evabt:alert-ver:00000000-0000-0000-0000-000000000001' } as any);
    expect(c.sendText.mock.calls[0][1]).toMatch(/dashboard\.ecosunpower\.eng\.br\/monitoramento\/00000000-0000-0000-0000-000000000001/);
  });
});
