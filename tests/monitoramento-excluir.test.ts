// tests/monitoramento-excluir.test.ts
import { describe, it, expect } from 'vitest';
import { MonitoringService } from '../src/modules/monitoring/service.js';

describe('excluirSistema', () => {
  it('deleta geracao_diaria e depois o sistema; ok=true', async () => {
    const calls: string[] = [];
    const supa = {
      getClient() {
        return {
          from(t: string) {
            return {
              delete() { calls.push(`delete:${t}`); return this; },
              eq() { return Promise.resolve({ error: null }); },
            };
          },
        };
      },
    } as any;
    const svc = new MonitoringService(supa);
    const r = await svc.excluirSistema('sis-1');
    expect(r.ok).toBe(true);
    expect(calls).toEqual(['delete:geracao_diaria', 'delete:sistemas_clientes']);
  });

  it('erro ao deletar sistema -> ok=false com reason', async () => {
    const supa = {
      getClient() {
        return {
          from(t: string) {
            return {
              delete() { return this; },
              eq() {
                return Promise.resolve({ error: t === 'sistemas_clientes' ? { message: 'fk' } : null });
              },
            };
          },
        };
      },
    } as any;
    const svc = new MonitoringService(supa);
    const r = await svc.excluirSistema('sis-1');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('fk');
  });
});
