// tests/proactive-alerts-anniversary.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runAnniversaryEnqueue } from '../src/modules/monitoring/proactive-alerts/anniversary.js';

describe('runAnniversaryEnqueue', () => {
  it('sistema instalado 2025-05-20 + hoje 2026-05-20 -> aniversario_1a', async () => {
    const sb = {
      getSistemasNoAniversarioHoje: vi.fn().mockResolvedValue([
        { id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa', data_instalacao: '2025-05-20', anos: 1 },
      ]),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
    };
    const hoje = new Date('2026-05-20T08:00:00Z');
    const r = await runAnniversaryEnqueue(hoje, sb as any);
    expect(r.enfileirados).toBe(1);
    expect(sb.upsertMaintenanceReminderPublic).toHaveBeenCalledWith({
      lead_id: 'lid-1',
      scheduled_date: '2026-05-20',
      topic: 'aniversario_1a',
    });
  });

  it('sistema sem lead_id é ignorado sem erro', async () => {
    const sb = {
      getSistemasNoAniversarioHoje: vi.fn().mockResolvedValue([
        { id: 'sid-1', lead_id: null, apelido: 'Casa', data_instalacao: '2025-05-20', anos: 1 },
      ]),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
    };
    const r = await runAnniversaryEnqueue(new Date('2026-05-20T08:00:00Z'), sb as any);
    expect(r.enfileirados).toBe(0);
    expect(sb.upsertMaintenanceReminderPublic).not.toHaveBeenCalled();
  });

  it('idempotência: chamar 2x não duplica (DB cuida pelo upsert)', async () => {
    const sb = {
      getSistemasNoAniversarioHoje: vi.fn().mockResolvedValue([
        { id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa', data_instalacao: '2025-05-20', anos: 1 },
      ]),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
    };
    const hoje = new Date('2026-05-20T08:00:00Z');
    await runAnniversaryEnqueue(hoje, sb as any);
    await runAnniversaryEnqueue(hoje, sb as any);
    expect(sb.upsertMaintenanceReminderPublic).toHaveBeenCalledTimes(2);
    // upsert é idempotente — DB protege, teste só valida que chamamos sempre.
  });

  it('vários sistemas -> enfileira todos', async () => {
    const sb = {
      getSistemasNoAniversarioHoje: vi.fn().mockResolvedValue([
        { id: 'sid-1', lead_id: 'lid-1', apelido: 'Casa 1', data_instalacao: '2025-05-20', anos: 1 },
        { id: 'sid-2', lead_id: 'lid-2', apelido: 'Casa 2', data_instalacao: '2024-05-20', anos: 2 },
      ]),
      upsertMaintenanceReminderPublic: vi.fn().mockResolvedValue(undefined),
    };
    const r = await runAnniversaryEnqueue(new Date('2026-05-20T08:00:00Z'), sb as any);
    expect(r.enfileirados).toBe(2);
    expect(sb.upsertMaintenanceReminderPublic).toHaveBeenNthCalledWith(2, {
      lead_id: 'lid-2',
      scheduled_date: '2026-05-20',
      topic: 'aniversario_2a',
    });
  });
});
