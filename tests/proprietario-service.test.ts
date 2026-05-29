// tests/proprietario-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MonitoringService } from '../src/modules/monitoring/service.js';

function fakeSupabaseClient(captura: { update?: any }) {
  return {
    getClient: () => ({
      from: () => ({
        update: (u: any) => { captura.update = u; return { eq: () => ({ error: null }) }; },
      }),
    }),
  };
}

describe('atualizarSistema — lead_id', () => {
  it('inclui lead_id (UUID) no update quando passado', async () => {
    const cap: any = {};
    const svc = new MonitoringService(fakeSupabaseClient(cap) as any);
    const uuid = '11111111-1111-1111-1111-111111111111';
    const r = await svc.atualizarSistema('s1', { apelido: 'X', lead_id: uuid } as any);
    expect(r.ok).toBe(true);
    expect(cap.update.lead_id).toBe(uuid);
  });

  it('inclui lead_id=null no update (desvincular)', async () => {
    const cap: any = {};
    const svc = new MonitoringService(fakeSupabaseClient(cap) as any);
    const r = await svc.atualizarSistema('s1', { apelido: 'X', lead_id: null } as any);
    expect(r.ok).toBe(true);
    expect(cap.update).toHaveProperty('lead_id', null);
  });

  it('ignora campos fora da allowlist (mass-assignment)', async () => {
    const cap: any = {};
    const svc = new MonitoringService(fakeSupabaseClient(cap) as any);
    await svc.atualizarSistema('s1', { apelido: 'X', api_credentials: { hack: 1 } } as any);
    expect(cap.update).not.toHaveProperty('api_credentials');
  });
});
